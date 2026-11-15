// Progressive enhancement only. The guide, commands and disclosures work without JS.
const status = document.getElementById("copy-status");
const resetTimers = new WeakMap();

if (window.isSecureContext && navigator.clipboard?.writeText) {
  for (const button of document.querySelectorAll("button[data-copy]")) {
    const target = document.getElementById(button.dataset.copy);
    if (!target) continue;

    const originalText = button.textContent;
    const label = button.dataset.label || "Text";
    let pending = false;
    button.setAttribute("aria-label", `Copy ${label.toLowerCase()}`);
    button.hidden = false;

    button.addEventListener("click", async () => {
      if (pending) return;
      pending = true;
      clearTimeout(resetTimers.get(button));
      // Do not disable the focused button: that would discard keyboard focus.
      button.setAttribute("aria-busy", "true");
      status.textContent = "";

      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        button.textContent = "Copied";
        button.dataset.state = "success";
        status.textContent = `${label} copied.`;
      } catch {
        button.textContent = "Select text";
        button.dataset.state = "error";
        status.textContent = `Clipboard access was denied. Select and copy ${label.toLowerCase()} manually.`;

        // Leave a keyboard-accessible, selected fallback; never request broader access.
        const focusTarget = target.closest("pre") || target;
        focusTarget.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
      } finally {
        pending = false;
        button.removeAttribute("aria-busy");
        resetTimers.set(
          button,
          setTimeout(() => {
            button.textContent = originalText;
            delete button.dataset.state;
          }, 2400),
        );
      }
    });
  }
}
