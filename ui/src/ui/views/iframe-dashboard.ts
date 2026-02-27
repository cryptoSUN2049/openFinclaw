import { html } from "lit";

export function renderIframeDashboard(src: string, title: string) {
  return html`<iframe src=${src} class="iframe-dashboard" title=${title}></iframe>`;
}
