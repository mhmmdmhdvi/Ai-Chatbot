// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MessageContent from "./MessageContent";


afterEach(cleanup);


describe("MessageContent", () => {
  it("renders Persian assistant bold text and lists without visible Markdown markers", () => {
    const { container } = render(
      <MessageContent
        content={"مزایای **Megatite SF**:\n\n- **گیرایی سریع:** پخت اولیه ۱۰ دقیقه\n- **عدم شره‌گی:** مناسب سطح عمودی"}
        formatted
      />,
    );

    expect(container.textContent).not.toContain("**");
    expect(screen.getByText("Megatite SF").tagName).toBe("STRONG");
    expect(screen.getByRole("list").tagName).toBe("UL");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const assistantContent = container.querySelector(".assistant-message-content");
    expect(assistantContent.getAttribute("dir")).toBe("rtl");
    expect(assistantContent.getAttribute("lang")).toBe("fa");
  });

  it("supports headings and numbered steps", () => {
    render(
      <MessageContent
        content={"### روش اجرا\n\n۱. سطح را تمیز کنید\n۲. دو جزء را **یکدست** مخلوط کنید"}
        formatted
      />,
    );

    expect(screen.getByText("روش اجرا").className).toContain("font-extrabold");
    expect(screen.getByRole("list").tagName).toBe("OL");
    expect(screen.getByText("یکدست").tagName).toBe("STRONG");
  });

  it("renders HTML-looking assistant content as inert text", () => {
    const { container } = render(
      <MessageContent content={'<img src="x" onerror="alert(1)"> **متن امن**'} formatted />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src="x" onerror="alert(1)">');
    expect(screen.getByText("متن امن").tagName).toBe("STRONG");
  });

  it("keeps customer messages as plain text", () => {
    const { container } = render(<MessageContent content="**پیام مشتری**" />);

    expect(container.textContent).toBe("**پیام مشتری**");
    expect(container.querySelector("strong")).toBeNull();
  });
});
