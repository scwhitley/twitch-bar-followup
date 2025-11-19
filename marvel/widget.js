async function updateTracker() {
  try {
    const res = await fetch("https://twitch-bar-followup.onrender.com/marvel");
    const data = await res.json();

    document.getElementById("current").textContent = data.current;
    document.getElementById("goal").textContent = data.goal;

    const percent = (data.current / data.goal) * 100;
    document.getElementById("bar-fill").style.width = `${percent}%`;

  } catch (err) {
    console.log("Tracker error:", err);
  }
}

setInterval(updateTracker, 1000);
updateTracker();
