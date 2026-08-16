"use strict";

const import_obsidian = require("obsidian");

function formatCardTextForDisplay(text) {
  return text.replaceAll("**", "");
}
var formatTermForDisplay = formatCardTextForDisplay;
function renderMultiPinIcon(button, crossedOut = false) {
  button.empty();
  const group = button.createSpan({ cls: "tir-multi-pin-icon" });
  group.setAttribute("aria-hidden", "true");
  for (let index = 1; index <= 3; index += 1) {
    const pin = group.createSpan({ cls: `tir-multi-pin-part tir-multi-pin-part-${index}` });
    (0, import_obsidian.setIcon)(pin, crossedOut ? "pin-off" : "pin");
  }
}
function renderGrowthIcon(button) {
  button.empty();
  const namespace = "http://www.w3.org/2000/svg";
  const svg = button.ownerDocument.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("tir-growth-icon");
  const liquid = button.ownerDocument.createElementNS(namespace, "path");
  liquid.setAttribute("d", "M3 18c2.2-2.2 4.2 2.2 6.4 0s4.2 2.2 6.4 0 4.2 2.2 5.2.7");
  liquid.classList.add("tir-growth-liquid");
  const bubble = button.ownerDocument.createElementNS(namespace, "circle");
  bubble.setAttribute("cx", "12");
  bubble.setAttribute("cy", "8");
  bubble.setAttribute("r", "4");
  bubble.classList.add("tir-growth-main-bubble");
  const smallBubble = button.ownerDocument.createElementNS(namespace, "circle");
  smallBubble.setAttribute("cx", "7.5");
  smallBubble.setAttribute("cy", "14");
  smallBubble.setAttribute("r", "1.25");
  smallBubble.classList.add("tir-growth-small-bubble");
  const seed = button.ownerDocument.createElementNS(namespace, "circle");
  seed.setAttribute("cx", "16.5");
  seed.setAttribute("cy", "14.5");
  seed.setAttribute("r", "1");
  seed.classList.add("tir-growth-seed");
  svg.append(liquid, bubble, smallBubble, seed);
  button.append(svg);
}
function createScrollingTerm(container, term) {
  const viewport = container.createSpan({ cls: "tir-term" });
  const text = viewport.createSpan({ cls: "tir-term-text", text: term });
  const stopScrolling = () => {
    viewport.classList.remove("is-scrolling");
  };
  const startScrolling = () => {
    stopScrolling();
    const overflow = Math.ceil(text.scrollWidth - viewport.clientWidth);
    if (overflow <= 1) return;
    viewport.style.setProperty("--tir-term-offset", `-${overflow}px`);
    viewport.style.setProperty(
      "--tir-term-scroll-duration",
      `${Math.max(1.6, overflow / 48).toFixed(2)}s`
    );
    void viewport.offsetWidth;
    viewport.classList.add("is-scrolling");
  };
  container.addEventListener("mouseenter", startScrolling);
  container.addEventListener("mouseleave", stopScrolling);
  container.addEventListener("focusin", startScrolling);
  container.addEventListener("focusout", stopScrolling);
  return viewport;
}

module.exports = { formatCardTextForDisplay, formatTermForDisplay, renderMultiPinIcon, renderGrowthIcon, createScrollingTerm };
