const roles = [
  { id: "babu", name: "Babu", points: 100, description: "Always earns 100 points." },
  { id: "police", name: "Police", points: 80, description: "Earns 80 points only when both guesses are right." },
  { id: "dakat", name: "Dakat", points: 60, description: "Earns 60 points if not identified." },
  { id: "chor", name: "Chor", points: 40, description: "Earns 40 points if not identified." },
];

const app = document.querySelector("#app");
const state = {
  screen: "home",
  players: [],
  round: 0,
  roleTurn: 0,
  guess: { chor: "", dakat: "" },
  outcome: null,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function roleFor(id) {
  return roles.find((role) => role.id === id);
}

function playerName(player) {
  return escapeHtml(player.name);
}

function renderHeader() {
  return `
    <header class="topbar">
      <a class="brand" href="#home" data-action="home" aria-label="Chor Police Dakat Babu home">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        <span class="brand-copy">The courtyard <span>CLASSIC, REPLAYED</span></span>
      </a>
      <div class="topbar-side">
        <span class="local-pill"><span class="status-dot"></span> Pass &amp; play</span>
        ${state.screen !== "home" ? '<button class="text-button" data-action="home">Exit game</button>' : ""}
      </div>
    </header>`;
}

function renderHome() {
  return `
    <main class="home-screen">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow"><span class="eyebrow-line"></span> FOUR PLAYERS. ONE VERY SUSPICIOUS ROOM.</p>
          <h1 id="hero-title">Chor. Police.<br /><span>Dakat. Babu.</span></h1>
          <p class="hero-description">A childhood classic, back around the table. Get dealt a secret role, keep a straight face, and see if the Police can crack the case.</p>
          <button class="button button-primary button-large" data-action="setup">
            Set up a game <span class="button-arrow" aria-hidden="true">→</span>
          </button>
          <p class="quiet-note"><span class="note-dot"></span> No sign-ups, downloads, or setup required. Play together on one device.</p>
        </div>
        <div class="hero-art" aria-label="Four secret roles, ready to be dealt" role="img">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="spark spark-one"></div><div class="spark spark-two"></div><div class="spark spark-three"></div>
          <article class="playing-card card-back"><span class="card-back-mark">?</span><span class="card-back-label">YOUR ROLE</span></article>
          <article class="playing-card card-front"><span class="card-front-kicker">THE DECK</span><div class="card-suits"><span>B</span><span>P</span><span>D</span><span>C</span></div><span class="card-front-label">Four sides<br />to every story.</span></article>
          <span class="art-note note-top">NO PEEKING</span><span class="art-note note-bottom">ROUND 01 / READY</span>
        </div>
      </section>

      <section class="roles-strip" aria-label="The four roles">
        <div class="strip-intro"><span class="strip-label">MEET THE CAST</span><span>One of each. No telling.</span></div>
        ${roles.map((role, index) => `
          <div class="role-tease role-tint-${index}">
            <span class="role-symbol" aria-hidden="true">${role.id.slice(0, 1).toUpperCase()}</span>
            <span>${role.name}</span>
          </div>`).join("")}
      </section>

      <section class="how-section" aria-labelledby="how-title">
        <div class="section-heading"><div><p class="eyebrow">THE SHORT VERSION</p><h2 id="how-title">Four roles. One guess.</h2></div><p>Easy to learn. Hard to keep a poker face.</p></div>
        <div class="steps-grid">
          <article class="step-card"><span class="step-number">01</span><div><h3>Gather your four</h3><p>Pass the device around. Everyone gets a private role.</p></div></article>
          <article class="step-card"><span class="step-number">02</span><div><h3>Deal the cards</h3><p>Babu, Police, Dakat, and Chor. One of each, randomly dealt.</p></div></article>
          <article class="step-card"><span class="step-number">03</span><div><h3>Make your call</h3><p>Police names the Chor and Dakat. Then all is revealed.</p></div></article>
        </div>
      </section>
      <footer class="site-footer"><span>MADE FOR THE NEXT ROUND</span><span>Four players · One device · Endless rematches</span></footer>
    </main>`;
}

function renderLobby() {
  return `
    <main class="flow-screen">
      <div class="flow-heading"><a class="back-link" href="#home" data-action="home">← Back</a><p class="eyebrow">BEFORE THE FIRST DEAL</p><h1>Who&apos;s playing?</h1><p>Choose four players and pass the device around. Keep your names short and easy to spot.</p></div>
      <form class="player-form" id="player-form">
        <div class="player-fields">
          ${[0, 1, 2, 3].map((index) => `
            <label class="player-field" for="player-${index}">
              <span class="field-number">0${index + 1}</span>
              <span class="field-label">Player ${index + 1}</span>
              <input id="player-${index}" name="player-${index}" maxlength="20" required autocomplete="off" placeholder="Enter a name" />
            </label>`).join("")}
        </div>
        <p class="form-error" id="form-error" role="alert" hidden></p>
        <button class="button button-primary button-large form-submit" type="submit">Deal the cards <span class="button-arrow" aria-hidden="true">→</span></button>
        <p class="form-footnote">Roles are revealed one at a time. Make sure nobody else is looking.</p>
      </form>
    </main>`;
}

function renderHandoff() {
  const currentPlayer = state.players[state.roleTurn];
  return `
    <main class="flow-screen handoff-screen">
      <div class="round-marker"><span class="status-dot"></span> ROUND ${String(state.round).padStart(2, "0")}</div>
      <div class="handoff-card">
        <div class="card-edge" aria-hidden="true"></div>
        <span class="step-counter">PLAYER ${state.roleTurn + 1} OF 4</span>
        <span class="sealed-icon" aria-hidden="true">?</span>
        <p class="eyebrow">PASS THE DEVICE TO</p>
        <h1>${playerName(currentPlayer)}</h1>
        <p class="handoff-copy">When you&apos;re the only one looking, reveal your card. Keep it secret.</p>
        <button class="button button-primary button-large" data-action="reveal-role">I&apos;m ${playerName(currentPlayer)} <span class="button-arrow" aria-hidden="true">→</span></button>
      </div>
      <p class="privacy-note"><span aria-hidden="true">●</span> Your role is private. It won&apos;t be shown again until the round ends.</p>
    </main>`;
}

function renderRole() {
  const currentPlayer = state.players[state.roleTurn];
  const role = roleFor(currentPlayer.role);
  const roleIndex = roles.findIndex((item) => item.id === role.id);
  return `
    <main class="flow-screen role-screen">
      <div class="round-marker"><span class="status-dot"></span> ROUND ${String(state.round).padStart(2, "0")} <span class="marker-separator">/</span> JUST FOR YOU</div>
      <div class="secret-role-card role-tint-${roleIndex}">
        <span class="role-card-caption">YOUR ROLE IS</span>
        <span class="role-card-symbol" aria-hidden="true">${role.id.slice(0, 1).toUpperCase()}</span>
        <h1>${role.name}</h1>
        <p>${role.description}</p>
        ${role.id === "police" ? '<div class="role-hint">The Police identity is public. Your guess is not.</div>' : '<div class="role-hint">Keep this card to yourself.</div>'}
      </div>
      <button class="button button-primary button-large" data-action="next-player">Hide role &amp; pass device <span class="button-arrow" aria-hidden="true">→</span></button>
      <p class="privacy-note">Next up: make sure the screen is clear before passing it on.</p>
    </main>`;
}

function renderGuessIntro() {
  const police = state.players.find((player) => player.role === "police");
  return `
    <main class="flow-screen handoff-screen">
      <div class="round-marker"><span class="status-dot"></span> ROUND ${String(state.round).padStart(2, "0")} <span class="marker-separator">/</span> THE CASE
      </div>
      <div class="handoff-card case-card">
        <span class="case-stamp" aria-hidden="true">P</span>
        <p class="eyebrow">THE POLICE HAVE BEEN IDENTIFIED</p>
        <h1>${playerName(police)}</h1>
        <p class="handoff-copy">Police, take the device. Name the player you think is Chor and the player you think is Dakat.</p>
        <button class="button button-primary button-large" data-action="open-guess">Make your call <span class="button-arrow" aria-hidden="true">→</span></button>
      </div>
      <p class="privacy-note">Everyone can see who the Police is. The other roles stay secret.</p>
    </main>`;
}

function renderGuess() {
  const police = state.players.find((player) => player.role === "police");
  const options = state.players.map((player, index) => ({ player, index })).filter(({ player }) => player.role !== "police");
  return `
    <main class="flow-screen guess-screen">
      <div class="round-marker"><span class="status-dot"></span> ROUND ${String(state.round).padStart(2, "0")} <span class="marker-separator">/</span> POLICE ON THE CASE
      </div>
      <div class="flow-heading guess-heading"><p class="eyebrow">YOUR TURN, POLICE</p><h1>Trust your instincts.</h1><p>Pick who you think is Chor and Dakat. Your choices lock in together.</p></div>
      <form id="guess-form" class="guess-form">
        <fieldset class="guess-group"><legend><span class="guess-index">01</span> Who is Chor?</legend><div class="guess-options">
          ${options.map(({ player, index }) => `<label class="guess-option"><input type="radio" name="chor" value="${index}" required /><span class="guess-player"><span class="player-initial">${playerName(player).slice(0, 1).toUpperCase()}</span>${playerName(player)}</span><span class="radio-indicator" aria-hidden="true"></span></label>`).join("")}
        </div></fieldset>
        <fieldset class="guess-group"><legend><span class="guess-index">02</span> Who is Dakat?</legend><div class="guess-options">
          ${options.map(({ player, index }) => `<label class="guess-option"><input type="radio" name="dakat" value="${index}" required /><span class="guess-player"><span class="player-initial">${playerName(player).slice(0, 1).toUpperCase()}</span>${playerName(player)}</span><span class="radio-indicator" aria-hidden="true"></span></label>`).join("")}
        </div></fieldset>
        <p class="form-error" id="guess-error" role="alert" hidden></p>
        <button class="button button-primary button-large form-submit" type="submit">Lock in the guess <span class="button-arrow" aria-hidden="true">→</span></button>
      </form>
      <p class="privacy-note">Police: ${playerName(police)} <span class="marker-separator">·</span> Your picks are revealed together.</p>
    </main>`;
}

function renderResult() {
  const { chorGuess, dakatGuess, scores } = state.outcome;
  const chor = state.players.find((player) => player.role === "chor");
  const dakat = state.players.find((player) => player.role === "dakat");
  const police = state.players.find((player) => player.role === "police");
  const policeCorrect = chorGuess === chor && dakatGuess === dakat;
  const roleOrder = ["babu", "police", "dakat", "chor"];
  const sortedPlayers = [...state.players].sort((a, b) => b.score - a.score);
  return `
    <main class="flow-screen result-screen">
      <div class="round-marker"><span class="status-dot"></span> ROUND ${String(state.round).padStart(2, "0")} <span class="marker-separator">/</span> THE REVEAL</div>
      <div class="flow-heading result-heading"><p class="eyebrow">THE CARDS ARE ON THE TABLE</p><h1>${policeCorrect ? "A case well played." : "Plot twist."}</h1><p>${policeCorrect ? `${playerName(police)} got both calls right.` : `${playerName(police)} didn&apos;t get both calls right this time.`} Here&apos;s how the round shook out.</p></div>
      <section class="reveal-grid" aria-label="Roles and round points">
        ${roleOrder.map((id) => {
          const role = roleFor(id);
          const player = state.players.find((item) => item.role === id);
          return `<article class="reveal-card role-tint-${roles.indexOf(role)}"><span class="reveal-role">${role.name}</span><span class="reveal-player">${playerName(player)}</span><span class="reveal-points">+${scores[id]} <small>PTS</small></span>${(id === "chor" && chorGuess === player) || (id === "dakat" && dakatGuess === player) ? '<span class="caught-tag">IDENTIFIED</span>' : ""}</article>`;
        }).join("")}
      </section>
      <section class="scoreboard" aria-labelledby="score-title"><div class="scoreboard-heading"><div><p class="eyebrow">AFTER ROUND ${String(state.round).padStart(2, "0")}</p><h2 id="score-title">The scoreboard</h2></div><span class="scoreboard-unit">TOTAL POINTS</span></div>
        <ol class="score-list">${sortedPlayers.map((player, index) => `<li class="score-row"><span class="score-rank">0${index + 1}</span><span class="score-name">${playerName(player)}${index === 0 ? '<span class="leader-tag">LEADING</span>' : ""}</span><span class="score-total">${player.score}<small>pts</small></span></li>`).join("")}</ol>
      </section>
      <button class="button button-primary button-large form-submit" data-action="next-round">${state.round < 9 ? "Deal the next round" : "Deal another round"} <span class="button-arrow" aria-hidden="true">→</span></button>
      <p class="privacy-note">Roles are shuffled again for the next round. Scores carry over.</p>
    </main>`;
}

function render() {
  const screens = {
    home: renderHome,
    lobby: renderLobby,
    handoff: renderHandoff,
    role: renderRole,
    guessIntro: renderGuessIntro,
    guess: renderGuess,
    result: renderResult,
  };
  app.innerHTML = `${renderHeader()}${screens[state.screen]()}`;
}

function beginRound() {
  const deck = ["babu", "police", "dakat", "chor"];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  state.players.forEach((player, index) => {
    player.role = deck[index];
  });
  state.round += 1;
  state.roleTurn = 0;
  state.guess = { chor: "", dakat: "" };
  state.outcome = null;
  state.screen = "handoff";
  render();
}

function startNewGame() {
  state.screen = "lobby";
  state.players = [];
  state.round = 0;
  state.roleTurn = 0;
  state.outcome = null;
  render();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  switch (button.dataset.action) {
    case "setup":
      state.screen = "lobby";
      render();
      break;
    case "home":
      state.screen = "home";
      render();
      break;
    case "reveal-role":
      state.screen = "role";
      render();
      break;
    case "next-player":
      if (state.roleTurn < state.players.length - 1) {
        state.roleTurn += 1;
        state.screen = "handoff";
      } else {
        state.screen = "guessIntro";
      }
      render();
      break;
    case "open-guess":
      state.screen = "guess";
      render();
      break;
    case "next-round":
      beginRound();
      break;
    default:
      break;
  }
});

app.addEventListener("submit", (event) => {
  if (event.target.id === "player-form") {
    event.preventDefault();
    const names = [0, 1, 2, 3].map((index) => new FormData(event.target).get(`player-${index}`).trim());
    const error = document.querySelector("#form-error");
    const normalizedNames = names.map((name) => name.toLocaleLowerCase());
    if (names.some((name) => !name)) {
      error.textContent = "Add a name for all four players to continue.";
      error.hidden = false;
      return;
    }
    if (new Set(normalizedNames).size !== names.length) {
      error.textContent = "Give each player a different name so the guesses stay clear.";
      error.hidden = false;
      return;
    }
    state.players = names.map((name) => ({ name, score: 0, role: "" }));
    beginRound();
  }

  if (event.target.id === "guess-form") {
    event.preventDefault();
    const formData = new FormData(event.target);
    const chorIndex = Number(formData.get("chor"));
    const dakatIndex = Number(formData.get("dakat"));
    const error = document.querySelector("#guess-error");
    if (!Number.isInteger(chorIndex) || !Number.isInteger(dakatIndex) || chorIndex === dakatIndex) {
      error.textContent = "Choose two different players, one for each role.";
      error.hidden = false;
      return;
    }
    const chorGuess = state.players[chorIndex];
    const dakatGuess = state.players[dakatIndex];
    const policeCorrect = chorGuess.role === "chor" && dakatGuess.role === "dakat";
    const scores = { babu: 100, police: policeCorrect ? 80 : 0, chor: chorGuess.role === "chor" ? 0 : 40, dakat: dakatGuess.role === "dakat" ? 0 : 60 };
    for (const player of state.players) player.score += scores[player.role];
    state.outcome = { chorGuess, dakatGuess, scores };
    state.screen = "result";
    render();
  }
});

render();
