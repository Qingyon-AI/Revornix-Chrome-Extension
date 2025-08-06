/// <reference types="chrome" />

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed!");
});