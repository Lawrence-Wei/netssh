// Credential storage — wraps `keyring-rs` so the rest of the codebase
// doesn't know which OS keystore is being used.
//
// On Windows: writes into Credential Manager under service "Netssh".
// On other platforms (CI / dev): falls back to the keyring crate's
// platform default — kwallet/SecretService on Linux, Keychain on macOS.

use anyhow::Result;
use keyring::Entry;

const SERVICE: &str = "Netssh";

pub fn store(account: &str, secret: &str) -> Result<()> {
    let entry = Entry::new(SERVICE, account)?;
    entry.set_password(secret)?;
    Ok(())
}

pub fn load(account: &str) -> Result<String> {
    let entry = Entry::new(SERVICE, account)?;
    Ok(entry.get_password()?)
}

pub fn delete(account: &str) -> Result<()> {
    let entry = Entry::new(SERVICE, account)?;
    entry.delete_credential()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "writes to the real keystore — run manually"]
    fn round_trip() {
        let acct = format!("netssh-test-{}", uuid::Uuid::new_v4());
        store(&acct, "hunter2").unwrap();
        assert_eq!(load(&acct).unwrap(), "hunter2");
        delete(&acct).unwrap();
    }
}
