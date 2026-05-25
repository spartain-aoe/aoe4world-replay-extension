export const TIMELINE_NATIVE_GATE_CSS = `
  body:has(select option[value="army"]):has(select option[value="workers"])
    canvas:not([data-aoe4-summary-canvas]):not(.aoe4-ageup-overlay),
  div:has(select option[value="army"]):has(select option[value="workers"])
    canvas:not([data-aoe4-summary-canvas]):not(.aoe4-ageup-overlay) {
    opacity: 0 !important;
  }
  body:has(select option[value="army"]):has(select option[value="workers"])
    .flex.items-center.cursor-pointer:not([data-aoe4-legend-injected]) {
    opacity: 0 !important;
  }
`;
