const { Service } = require("node-windows");
const svc = new Service({
  name: "Update DB App",
  description: "Update DB app as a Windows service.",
  script: "C:\\apps\\update-db\\server.js",
});

svc.on("install", () => {
  svc.start();
});

svc.on("alreadyinstalled", () => {
  console.log("Service is already installed.");
});

svc.on("start", () => {
  console.log("Service started successfully.");
});

svc.on("stop", () => {
  console.log("Service stopped successfully.");
});

svc.on("uninstall", () => {
  console.log("Service uninstalled successfully.");
});

const command = process.argv[2];

switch (command) {
  case "uninstall":
    svc.uninstall();
    break;

  case "start":
    svc.start();
    break;

  case "stop":
    svc.stop();
    break;

  case "status":
    console.log(
      `Service status: ${svc.exists ? "Installed" : "Not installed"}`,
    );
    break;

  case "restart":
    svc.stop();
    svc.on("stop", () => {
      svc.start();
    });
    break;

  default:
    svc.install();
    break;
}
