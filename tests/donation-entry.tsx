// jsdom 测试专用挂载入口：由 tests/donation.test.mjs 经 esbuild 打包后注入 jsdom
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../app/lib/i18n";
import { DonateButton } from "../app/components/donate-button";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <I18nProvider>
      <DonateButton />
    </I18nProvider>,
  );
}
