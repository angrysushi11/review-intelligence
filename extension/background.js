import { buildRetrieverUrl } from "./retriever-url.js";

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: buildRetrieverUrl(tab?.url) });
});
