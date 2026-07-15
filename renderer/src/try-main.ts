import "./app.css";
import { installDemoElectronAPI } from "./lib/demoPlatform";
import TryPage from "./TryPage.svelte";
import { mount } from "svelte";

installDemoElectronAPI();

const app = mount(TryPage, {
  target: document.getElementById("app")!,
});

export default app;
