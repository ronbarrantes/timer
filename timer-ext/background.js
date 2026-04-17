// Service worker — handles alarm + notification when timer hits zero.
// The popup is ephemeral (killed when closed), so alarms fire here instead.

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "timer-done") return;

  chrome.notifications.create("timer-done", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Time's up! ⏱",
    message: "Your QA Timer has finished.",
  });
});
