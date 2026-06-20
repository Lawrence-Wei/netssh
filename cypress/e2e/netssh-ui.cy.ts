describe("Netssh browser UI smoke", () => {
  function visitApp(options?: { seedInventory?: boolean }) {
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.clear();
        if (options?.seedInventory) {
          win.localStorage.setItem("netssh.hosts", JSON.stringify({
            state: {
              groups: [
                { id: "shanghai", name: "Shanghai", color: "#a8977a" },
                { id: "cloud", name: "Cloud", color: "#6b89bd" },
              ],
              hosts: [
                {
                  id: "cy-huawei-switch",
                  alias: "cy-huawei-switch",
                  hostname: "192.0.2.20",
                  user: "admin",
                  port: 22,
                  group: "shanghai",
                  status: "off",
                  latency: null,
                  connectionType: "ssh",
                  source: "manual",
                  deployScope: "local",
                  iconOverride: "huawei",
                  role: "switch",
                  tags: ["switch", "huawei"],
                },
              ],
            },
            version: 0,
          }));
        }
      },
    });
    cy.get(".app-window").should("be.visible");
  }

  it("renders the operations workbench with home before sessions", () => {
    visitApp();
    cy.get(".titlebar-brand").should("be.visible");
    cy.get(".tabstrip > .tab").first().should("have.class", "active");
    cy.get(".tabstrip > .tab").first().find(".label").invoke("text").should("match", /Home|首页/);
    cy.get(".app-menu").should("be.visible");
    cy.get(".sidebar").should("be.visible");
    cy.get(".topology-panel").should("be.visible");
  });

  it("opens account settings from the avatar button", () => {
    visitApp({ seedInventory: true });
    cy.get(".titlebar-settings-btn").click();
    cy.get(".settings-nav").should("be.visible");
    cy.get(".settings-nav button").first().click();
    cy.get(".account-card").should("be.visible");
    cy.get(".account-host-list").should("be.visible");
    cy.get(".account-host-row").should("have.length.greaterThan", 0);
  });

  it("stores credential metadata without showing or persisting the password", () => {
    const password = "DoNotRender-Secret-123!";

    visitApp();
    cy.get(".titlebar-settings-btn").click();
    cy.get(".settings-nav button").eq(5).click();
    cy.get(".settings-pane").within(() => {
      cy.get(".settings-section .btn").first().click();
      cy.get(".cred-editor input").eq(0).type("Cypress switch admin");
      cy.get(".cred-editor input").eq(1).clear().type("switch");
      cy.get(".cred-editor input").eq(2).type("admin");
      cy.get(".cred-editor input").eq(3).type(password, { log: false });
      cy.get(".cred-editor__foot .btn").last().click();
    });

    cy.contains(".cred-item", "Cypress switch admin").should("be.visible");
    cy.get("body").should("not.contain", password);
    cy.window().then((win) => {
      expect(win.localStorage.getItem("netssh.credentials") || "").not.to.include(password);
    });
  });

  it("opens a new manual SSH session with primary fields and advanced options separated", () => {
    visitApp();
    cy.get(".tab-new").click();
    cy.get(".manual-card--primary").should("be.visible");
    cy.get(".manual-card__primary-grid input").should("have.length", 3);
    cy.get(".manual-card__primary-grid input").eq(0).type("192.0.2.10");
    cy.get(".manual-card__primary-grid input").eq(1).type("admin");
    cy.get(".manual-card__primary-grid input").eq(2).type("temporary-secret", { log: false });
    cy.get(".manual-card__advanced").should("be.visible");
    cy.get(".manual-card__advanced-grid input").should("have.length.greaterThan", 1);
    cy.get(".manual-card__advanced-grid input").first().should("have.value", "22");
    cy.get("body").should("not.contain", "temporary-secret");
  });

  it("can collapse and expand the device sidebar", () => {
    visitApp();
    cy.get(".sidebar").should("be.visible");
    cy.get(".titlebar-sidebar-toggle").click();
    cy.get(".sidebar").should("not.exist");
    cy.get(".titlebar-sidebar-toggle").click();
    cy.get(".sidebar").should("be.visible");
  });
});
