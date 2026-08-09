import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import App from "./App";


describe("App", () => {
  it("renders the Persian product title", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("دستیار هوشمند مشتریان");
  });
});
