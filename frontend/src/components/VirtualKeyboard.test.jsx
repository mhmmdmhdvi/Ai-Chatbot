// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import VirtualKeyboard from "./VirtualKeyboard";


afterEach(() => cleanup());


function KeyboardHarness({ onSubmit = () => {} }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <input
          aria-label="نام"
          data-keyboard-next="phone"
          data-virtual-keyboard="persian"
          id="name"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
        <input
          aria-label="شماره موبایل"
          data-virtual-keyboard="numeric"
          id="phone"
          onChange={(event) => setPhone(event.target.value)}
          value={phone}
        />
      </form>
      <VirtualKeyboard />
    </>
  );
}


describe("Megatite virtual keyboard", () => {
  it("uses physical Persian keyboard rows", async () => {
    const user = userEvent.setup();
    render(<KeyboardHarness />);

    await user.click(screen.getByLabelText("نام"));
    await screen.findByRole("region", { name: /صفحه‌کلید مگاتایت برای نام/ });

    const rows = [...document.querySelectorAll(".virtual-keyboard-row")];
    const rowText = rows.map((row) => [...row.querySelectorAll(".virtual-key")].map((key) => key.textContent));

    expect(rowText).toEqual([
      ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹", "۰"],
      ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "چ"],
      ["ش", "س", "ی", "ب", "ل", "ا", "ت", "ن", "م", "ک", "گ"],
      ["ظ", "ط", "ز", "ر", "ذ", "د", "پ", "و", "،", "؟"],
    ]);
  });

  it("types Persian and Latin text, deletes, and closes explicitly", async () => {
    const user = userEvent.setup();
    render(<KeyboardHarness />);

    const nameInput = screen.getByLabelText("نام");
    await user.click(nameInput);
    expect(await screen.findByRole("region", { name: /صفحه‌کلید مگاتایت برای نام/ })).toBeTruthy();
    expect(document.documentElement.classList.contains("virtual-keyboard-visible")).toBe(true);

    await user.click(screen.getByRole("button", { name: "س" }));
    await user.click(screen.getByRole("button", { name: "ل" }));
    expect(nameInput.value).toBe("سل");

    await user.click(screen.getByRole("button", { name: "EN" }));
    await user.click(screen.getByRole("button", { name: "q" }));
    expect(nameInput.value).toBe("سلq");
    await user.click(screen.getByRole("button", { name: "پاک کردن" }));
    expect(nameInput.value).toBe("سل");

    await user.click(screen.getByRole("button", { name: "بستن صفحه‌کلید" }));
    expect(screen.queryByRole("region", { name: /صفحه‌کلید مگاتایت/ })).toBeNull();
    expect(document.documentElement.classList.contains("virtual-keyboard-visible")).toBe(false);
  });

  it("moves to the phone keypad and submits with its Enter key", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<KeyboardHarness onSubmit={onSubmit} />);

    await user.click(screen.getByLabelText("نام"));
    await user.click(await screen.findByRole("button", { name: /بعدی/ }));
    expect(document.activeElement).toBe(screen.getByLabelText("شماره موبایل"));
    expect(document.querySelector(".virtual-keyboard-numeric")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "9" }));
    await user.click(screen.getByRole("button", { name: "0" }));
    expect(screen.getByLabelText("شماره موبایل").value).toBe("90");
    await user.click(screen.getByRole("button", { name: /تأیید/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: /صفحه‌کلید مگاتایت/ })).toBeNull();
  });
});
