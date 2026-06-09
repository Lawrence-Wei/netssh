use std::io::{Read, Write};
use std::sync::mpsc::{self, TryRecvError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serialport::{self, DataBits, FlowControl, Parity, SerialPort, StopBits};
use tauri::{AppHandle, Emitter};

use crate::commands::emit_data;

const DEFAULT_BAUD_RATE: u32 = 9600;
const DEFAULT_DATA_BITS: u8 = 8;
const DEFAULT_PARITY: &str = "none";
const DEFAULT_STOP_BITS: f32 = 1.0;
const DEFAULT_FLOW_CONTROL: &str = "none";

#[derive(Serialize)]
pub struct SerialPortInfo {
    pub port_name: String,
    pub transport: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
}

#[derive(Deserialize)]
pub struct SerialOpenArgs {
    pub port_name: String,
    pub baud_rate: Option<u32>,
    pub data_bits: Option<u8>,
    pub parity: Option<String>,
    pub stop_bits: Option<f32>,
    pub flow_control: Option<String>,
    pub line_ending: Option<String>,
}

pub struct SerialSession {
    /// 应用句柄，预留给将来 reconnect / 状态事件发送等场景使用
    _app: AppHandle,
    /// 会话标识符，预留给将来日志 / 诊断等场景使用
    _id: String,
    line_ending: String,
    writer: Arc<Mutex<Box<dyn SerialPort + Send>>>,
    stop_tx: mpsc::Sender<()>,
    stop_handle: Option<thread::JoinHandle<()>>,
}

impl SerialSession {
    pub fn open(app: &AppHandle, id: &str, args: SerialOpenArgs) -> Result<Self> {
        let port_name = args.port_name.trim().to_string();
        if port_name.is_empty() {
            return Err(anyhow::anyhow!("serial_port_name_required"));
        }

        let writer = serialport::new(&port_name, parse_baud_rate(args.baud_rate)?)
            .data_bits(parse_data_bits(args.data_bits)?)
            .parity(parse_parity(&args.parity)?)
            .stop_bits(parse_stop_bits(args.stop_bits)?)
            .flow_control(parse_flow_control(args.flow_control)?)
            .timeout(Duration::from_millis(150))
            .open()?;

        let mut reader = writer.try_clone()?;
        let line_ending = normalize_line_ending(args.line_ending.unwrap_or_else(|| "none".into()));
        let app_clone = app.clone();
        let id_clone = id.to_string();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let stop_rx = Arc::new(Mutex::new(stop_rx));
        let read_handle = thread::spawn({
            let stop_rx = stop_rx.clone();
            let app_clone = app_clone.clone();
            move || loop {
                let mut buf = [0u8; 4096];
                let mut exit = false;
                match reader.read(&mut buf) {
                    Ok(0) => exit = true,
                    Ok(n) => emit_data(&app_clone, "serial", &id_clone, &buf[..n]),
                    Err(err) if err.kind() == std::io::ErrorKind::TimedOut => {
                        match stop_rx.lock().unwrap_or_else(|e| e.into_inner()).try_recv() {
                            Ok(_) | Err(TryRecvError::Disconnected) => exit = true,
                            Err(TryRecvError::Empty) => {}
                        }
                    }
                    Err(_) => exit = true,
                }

                if exit {
                    let _ = app_clone.emit(&format!("serial:{}:exit", id_clone), ());
                    break;
                }
            }
        });

        Ok(Self {
            _app: app.clone(),
            _id: id.to_string(),
            line_ending,
            writer: Arc::new(Mutex::new(writer)),
            stop_tx,
            stop_handle: Some(read_handle),
        })
    }

    pub fn send(&self, data: &[u8]) -> Result<()> {
        let mut w = self.writer.lock().unwrap();
        let mut transformed = Vec::from(data);
        if self.line_ending == "lf" {
            transformed.push(b'\n');
        } else if self.line_ending == "crlf" {
            transformed.push(b'\r');
            transformed.push(b'\n');
        } else if self.line_ending == "cr" {
            transformed.push(b'\r');
        }
        w.write_all(&transformed)?;
        Ok(())
    }

    pub fn resize(&self, _cols: u16, _rows: u16) -> Result<()> {
        // Serial streams are fixed-width by device; resize is explicitly a no-op for now.
        Ok(())
    }

    pub fn close(mut self) -> Result<()> {
        let _ = self.stop_tx.send(());
        if let Some(handle) = self.stop_handle.take() {
            let _ = handle.join();
        }
        Ok(())
    }
}

pub fn list_ports() -> Result<Vec<SerialPortInfo>> {
    let mut out: Vec<SerialPortInfo> = serialport::available_ports()?
        .into_iter()
        .map(|info| {
            let (transport, manufacturer, product, serial_number, vendor_id, product_id) =
                port_metadata(&info.port_type);
            SerialPortInfo {
                port_name: info.port_name,
                transport,
                manufacturer,
                product,
                serial_number,
                vendor_id,
                product_id,
            }
        })
        .collect();

    out.sort_by(|a, b| a.port_name.cmp(&b.port_name));
    Ok(out)
}

fn parse_baud_rate(raw: Option<u32>) -> Result<u32> {
    let baud = raw.unwrap_or(DEFAULT_BAUD_RATE);
    if !(75..=1152000).contains(&baud) {
        anyhow::bail!("serial_invalid_baud_rate: {baud}");
    }
    Ok(baud)
}

fn parse_data_bits(raw: Option<u8>) -> Result<DataBits> {
    match raw.unwrap_or(DEFAULT_DATA_BITS) {
        5 => Ok(DataBits::Five),
        6 => Ok(DataBits::Six),
        7 => Ok(DataBits::Seven),
        8 => Ok(DataBits::Eight),
        got => anyhow::bail!("serial_invalid_data_bits: {got}"),
    }
}

fn parse_parity(raw: &Option<String>) -> Result<Parity> {
    match raw.as_deref().unwrap_or(DEFAULT_PARITY).to_ascii_lowercase().as_str() {
        "none" => Ok(Parity::None),
        "odd" => Ok(Parity::Odd),
        "even" => Ok(Parity::Even),
        "mark" => Err(anyhow::anyhow!("serial_parity_mark_not_supported")),
        "space" => Err(anyhow::anyhow!("serial_parity_space_not_supported")),
        got => anyhow::bail!("serial_invalid_parity: {got}"),
    }
}

fn parse_stop_bits(raw: Option<f32>) -> Result<StopBits> {
    match raw.unwrap_or(DEFAULT_STOP_BITS) {
        v if (v - 1.0).abs() < f32::EPSILON => Ok(StopBits::One),
        v if (v - 2.0).abs() < f32::EPSILON => Ok(StopBits::Two),
        v if (v - 1.5).abs() < f32::EPSILON => {
            anyhow::bail!("serial_stop_bits_1_5_not_supported")
        }
        got => anyhow::bail!("serial_invalid_stop_bits: {got}"),
    }
}

fn parse_flow_control(raw: Option<String>) -> Result<FlowControl> {
    match raw
        .as_deref()
        .unwrap_or(DEFAULT_FLOW_CONTROL)
        .to_ascii_lowercase()
        .as_str()
    {
        "none" => Ok(FlowControl::None),
        "software" => Ok(FlowControl::Software),
        "hardware" => Ok(FlowControl::Hardware),
        got => anyhow::bail!("serial_invalid_flow_control: {got}"),
    }
}

fn normalize_line_ending(raw: String) -> String {
    match raw.to_ascii_lowercase().as_str() {
        "lf" | "crlf" | "cr" => raw.to_ascii_lowercase(),
        "none" | "" | _ => "none".into(),
    }
}

fn port_metadata(
    port_type: &serialport::SerialPortType,
) -> (String, Option<String>, Option<String>, Option<String>, Option<u16>, Option<u16>) {
    match port_type {
        serialport::SerialPortType::UsbPort(info) => {
            let vendor_id = info.vid;
            let product_id = info.pid;
            (
                "usb".into(),
                info.manufacturer.clone(),
                info.product.clone(),
                info.serial_number.clone(),
                Some(vendor_id),
                Some(product_id),
            )
        }
        serialport::SerialPortType::BluetoothPort => {
            ("bluetooth".into(), None, None, None, None, None)
        }
        serialport::SerialPortType::PciPort => ("pci".into(), None, None, None, None, None),
        serialport::SerialPortType::Unknown => ("unknown".into(), None, None, None, None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_data_bits_default() {
        assert!(matches!(parse_data_bits(None).unwrap(), DataBits::Eight));
    }

    #[test]
    fn parse_invalid_data_bits() {
        assert!(parse_data_bits(Some(9)).is_err());
    }

    #[test]
    fn normalize_line_ending_known_modes() {
        assert_eq!(normalize_line_ending("LF".into()), "lf");
        assert_eq!(normalize_line_ending("CrLf".into()), "crlf");
        assert_eq!(normalize_line_ending("".into()), "none");
    }
}
