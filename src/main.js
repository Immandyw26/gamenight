import './style.css';
import { supabase } from './supabase.js';

const app = document.querySelector('#app');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* =========================================================
   GAME STATE
   ========================================================= */

const game = {
  boardImage: null,
  characters: [],
  selectedCharacter: null,
  path: [],
  spaceSize: 34,
  editMode: false,
  selectedSpaceIndex: null,
  draggingSpaceIndex: null,

  branchMode: false,
  branchStartIndex: null,

  routeMode: false,
  routeStartIndex: null,
  routeName: '',
  connectMode: false,
  connectStartIndex: null,
  drawCardMode: false,
  cardDeck: [],
  discardedCards: [],
  customCards: [],

  players: [],
  playerId: null,
  playerName: '',
  roomCode: null,
  hostId: null,
  editingBoard: false,
  editingBoardId: null,
  diceValue: 1,
  isRolling: false,
};

const defaultCards = [
  {
    id: 1,
    title: 'Treasure!',
    text: 'Move forward 2 spaces.',
    effect: 'move',
    amount: 2,
  },
  {
    id: 2,
    title: 'Walk the Plank!',
    text: 'Move backward 2 spaces.',
    effect: 'move',
    amount: -2,
  },
  {
    id: 3,
    title: 'Rum Break!',
    text: 'Skip your next turn.',
    effect: 'skip',
    amount: 1,
  },
  {
    id: 4,
    title: 'Lucky Pirate!',
    text: 'Roll again!',
    effect: 'reroll',
    amount: 1,
  },
  {
    id: 5,
    title: 'Captain’s Orders!',
    text: 'Move forward 3 spaces.',
    effect: 'move',
    amount: 3,
  },
  {
    id: 6,
    title: 'Shark Attack!',
    text: 'Move backward 3 spaces.',
    effect: 'move',
    amount: -3,
  },
];

/* =========================================================
   SUPABASE ROOM FUNCTIONS
   ========================================================= */

function generateRoomCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = '';

  for (let i = 0; i < 5; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return code;
}

async function createRoom() {
  const roomCode = generateRoomCode();
  const hostId = crypto.randomUUID();

  const { data, error } = await supabase
    .from('rooms')
    .insert({
      code: roomCode,
      host_id: hostId,
      status: 'lobby',
      board_image: game.boardImage,
      characters: game.characters,
      path: game.path,
      cards: game.customCards,
    })
    .select()
    .single();

  if (error) {
    console.error('Room creation failed:', error);
    alert(`Could not create room: ${error.message}`);
    return;
  }

  game.roomCode = roomCode;
  game.hostId = hostId;
  game.playerId = hostId;
  game.playerName = 'Captain';

  // The host's selected character becomes unavailable
  // to everyone else who joins the room.
  const hostCharacterIndex = game.selectedCharacter;

  const { data: hostPlayer, error: playerError } = await supabase
    .from('players')
    .insert({
      room_id: data.id,
      player_id: String(hostId),
      name: 'Mango',
      character_index: hostCharacterIndex,
      is_host: true,
      position: 0,
    })
    .select()
    .single();

  if (playerError) {
    console.error('Host player creation failed:', playerError);

    alert(
      `The room was created, but the captain could not join the crew: ${playerError.message}`
    );

    return;
  }

  game.players = [hostPlayer];

  console.log('Room created!', data);
  console.log('Host player created!', hostPlayer);

  showLobby();
}

/* =========================================================
   MULTIPLAYER LOBBY
   ========================================================= */

function showLobby() {
  async function startLobbyGame() {
    if (!game.roomCode) {
      alert('🏴‍☠️ There is no active game room.');
      return;
    }

    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'playing',
      })
      .eq('code', game.roomCode);

    if (error) {
      console.error('Could not start game:', error);
      alert(`Could not start the game: ${error.message}`);
      return;
    }

    showGameBoard();
  }
  app.innerHTML = `
      <div class="setup-screen">
        <button class="back-button" id="leave-lobby">
          ← Leave Lobby
        </button>
  
        <h1>🏴‍☠️ Game Lobby</h1>
  
        <p class="setup-subtitle">
          Your crew is gathering! Give your friends the room code.
        </p>
  
        <div
          style="
            margin: 25px auto;
            padding: 25px;
            max-width: 500px;
            background: #fff0bd;
            border: 4px solid #f6b928;
            border-radius: 22px;
            box-shadow: 0 5px 0 #c98512;
            text-align: center;
          "
        >
          <div
            style="
              font-size: 18px;
              font-weight: 900;
              color: #70482d;
              margin-bottom: 8px;
            "
          >
            🔑 ROOM CODE
          </div>
  
          <div
            style="
              font-size: 42px;
              letter-spacing: 6px;
              font-weight: 900;
              color: #183b52;
              margin-bottom: 15px;
            "
          >
            ${game.roomCode}
          </div>
  
          <p
            style="
              margin: 0;
              color: #70482d;
            "
          >
            Share this code with your crew!
          </p>
        </div>
  
        <div class="setup-section">
          <h2>👥 Your Crew</h2>
  
          <div
  id="lobby-player-list"
  style="
    padding: 20px;
    text-align: center;
  "
>
  <div
    style="
      padding: 20px;
      background: #fff9e8;
      border-radius: 16px;
      border: 2px solid #f6b928;
    "
  >
    🏴‍☠️ Loading your crew...
  </div>
</div>
        </div>
  
        <div class="setup-actions">
          <button
            id="start-game"
            class="primary-button"
          >
            ⚓ Start Game
          </button>
        </div>
  
        <p
          style="
            text-align: center;
            margin-top: 12px;
            color: #70482d;
            font-size: 14px;
          "
        >
          You are the captain. Only the host can start the game.
        </p>
      </div>
    `;

  document.querySelector('#leave-lobby').addEventListener('click', showHome);

  document.querySelector('#start-game').addEventListener('click', async () => {
    await startLobbyGame();
  });

  loadLobbyPlayers();
  setupLobbyRealtime();
}

async function loadLobbyPlayers() {
  if (!game.roomCode) return;

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id')
    .eq('code', game.roomCode)
    .maybeSingle();

  if (roomError || !room) {
    console.error('Could not find room:', roomError);
    return;
  }

  const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Could not load players:', error);
    return;
  }

  game.players = players || [];

  const playerList = document.querySelector('#lobby-player-list');

  if (!playerList) return;

  if (!players || players.length === 0) {
    playerList.innerHTML = `
      <div
        style="
          padding: 20px;
          background: #fff9e8;
          border-radius: 16px;
          border: 2px solid #f6b928;
        "
      >
        🏴‍☠️ Waiting for your crew to join...
      </div>
    `;

    return;
  }

  playerList.innerHTML = players
    .map((player) => {
      const character = game.characters[player.character_index];

      const characterName = character
        ? character.name || `Character ${player.character_index + 1}`
        : 'Unknown Pirate';

      return `
        <div
          style="
            padding: 14px;
            margin-bottom: 10px;
            background: #fff9e8;
            border: 2px solid #f6b928;
            border-radius: 14px;
          "
        >
          <strong>
            ${player.is_host ? '👑 ' : '🏴‍☠️ '}
            ${escapeHtml(player.name)}
          </strong>

          <div style="margin-top: 4px;">
            ${escapeHtml(characterName)}
          </div>
        </div>
      `;
    })
    .join('');
}

function setupLobbyRealtime() {
  if (!game.roomCode) return;

  const channel = supabase
    .channel(`lobby-${game.roomCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'players',
      },
      () => {
        loadLobbyPlayers();
      }
    )
    .subscribe((status) => {
      console.log('Lobby realtime status:', status);
    });

  game.lobbyChannel = channel;
}

/* =========================================================
   HOME SCREEN
   ========================================================= */

function showHome() {
  app.innerHTML = `
    <div class="home-screen">
      <h1>🎲 Game Night</h1>
      <p>Birdman and Ghehrhie's Bar. Black out or back out.</p>

      <div class="menu-buttons">
  <button id="create-game">Create Game</button>
  <button id="join-game">Join Game</button>
  <button id="my-boards">📚 My Boards</button>
  <button id="my-decks">🃏 My Decks</button>
</div>
    </div>
  `;

  document
    .querySelector('#create-game')
    .addEventListener('click', showCreateGame);

  document.querySelector('#join-game').addEventListener('click', showJoinGame);
  document.querySelector('#my-boards').addEventListener('click', showMyBoards);

  document.querySelector('#my-decks').addEventListener('click', showMyDecks);
}

function showJoinGame() {
  app.innerHTML = `
    <div class="screen">
      <div class="card">
        <h1>🏴‍☠️ Join Game</h1>
        <p>Enter the captain's room code.</p>

        <input
          id="room-code-input"
          type="text"
          maxlength="5"
          placeholder="ROOM CODE"
          autocomplete="off"
        >

        <button id="find-game" class="primary-button">
          🔎 Find Game
        </button>

        <button id="back-home" class="secondary-button">
          ← Back
        </button>
      </div>
    </div>
  `;

  const roomInput = document.querySelector('#room-code-input');

  roomInput.addEventListener('input', () => {
    roomInput.value = roomInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);
  });

  document.querySelector('#back-home').addEventListener('click', showHome);

  document.querySelector('#find-game').addEventListener('click', async () => {
    const roomCode = roomInput.value.trim().toUpperCase();

    if (!roomCode) {
      alert('🏴‍☠️ Enter a room code first!');
      return;
    }

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', roomCode)
      .eq('status', 'lobby')
      .maybeSingle();

    if (error) {
      console.error('Could not find room:', error);
      alert(`Could not find the game: ${error.message}`);
      return;
    }

    if (!data) {
      alert('🏴‍☠️ No open lobby found with that room code.');
      return;
    }

    game.roomCode = data.code;
    game.hostId = data.host_id;
    game.boardImage = data.board_image;
    game.characters = data.characters || [];
    game.path = data.path || [];
    game.customCards = data.cards || [];
    game.selectedCharacter = null;
    game.players = [];

    showJoinCrew(data);
  });
}

async function showJoinCrew(room) {
  const characters = room.characters || [];

  app.innerHTML = `
    <div class="setup-screen">
      <button class="back-button" id="back-to-join">
        ← Back
      </button>

      <h1>🏴‍☠️ Join the Crew</h1>

      <p class="setup-subtitle">
        Enter your name and choose your pirate!
      </p>

      <div class="setup-section">
        <h2>👤 Your Pirate Name</h2>

        <input
          id="player-name"
          type="text"
          maxlength="20"
          placeholder="Enter your name"
          autocomplete="off"
        >
      </div>

      <div class="setup-section">
        <h2>🏴‍☠️ Choose Your Character</h2>

        <div id="join-character-list" class="character-grid"></div>
      </div>

      <div class="setup-actions">
        <button
          id="join-crew"
          class="primary-button"
          disabled
        >
          🏴‍☠️ Join Crew
        </button>
      </div>
    </div>
  `;

  const characterList = document.querySelector('#join-character-list');

  // Find which character the host is using.
  // The host's player record is identified by the room's host_id.
  const { data: hostPlayer } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room.id)
    .eq('player_id', room.host_id)
    .maybeSingle();

  const hostCharacterIndex = hostPlayer ? hostPlayer.character_index : null;

  const availableCharacters = characters
    .map((character, index) => ({ character, index }))
    .filter(({ index }) => index !== hostCharacterIndex);

  if (availableCharacters.length === 0) {
    characterList.innerHTML = `
      <div class="empty-message">
        🏴‍☠️ There are no characters available right now.
      </div>
    `;
  } else {
    characterList.innerHTML = availableCharacters
      .map(({ character, index }) => {
        const displayName = character.name || `Character ${index + 1}`;

        return `
          <label class="character-choice">
            <input
              type="radio"
              name="join-player-character"
              value="${index}"
            >

            <img
              src="${escapeHtml(character.image)}"
              alt="${escapeHtml(displayName)}"
            >

            <span>
              ${escapeHtml(displayName)}
            </span>
          </label>
        `;
      })
      .join('');
  }

  const playerNameInput = document.querySelector('#player-name');
  const joinButton = document.querySelector('#join-crew');

  function updateJoinButton() {
    const hasName = playerNameInput.value.trim().length > 0;
    const selectedCharacter = document.querySelector(
      'input[name="join-player-character"]:checked'
    );

    joinButton.disabled = !(hasName && selectedCharacter);
  }

  playerNameInput.addEventListener('input', updateJoinButton);

  document
    .querySelectorAll('input[name="join-player-character"]')
    .forEach((input) => {
      input.addEventListener('change', updateJoinButton);
    });

  document
    .querySelector('#back-to-join')
    .addEventListener('click', showJoinGame);

  joinButton.addEventListener('click', async () => {
    const playerName = playerNameInput.value.trim();

    const selectedCharacter = document.querySelector(
      'input[name="join-player-character"]:checked'
    );

    if (!playerName) {
      alert('🏴‍☠️ Enter your pirate name!');
      return;
    }

    if (!selectedCharacter) {
      alert('🏴‍☠️ Choose a character first!');
      return;
    }

    const selectedCharacterIndex = Number(selectedCharacter.value);

    const playerId = crypto.randomUUID();

    const { data, error } = await supabase
      .from('players')
      .insert({
        room_id: room.id,
        player_id: playerId,
        name: playerName,
        character_index: selectedCharacterIndex,
        is_host: false,
        position: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('Could not join crew:', error);
      alert(`Could not join the game: ${error.message}`);
      return;
    }

    game.playerId = playerId;
    game.playerName = playerName;
    game.selectedCharacter = selectedCharacterIndex;
    game.players = [data];

    console.log('Joined crew!', data);

    showLobby();
  });
}

async function showMyDecks() {
  app.innerHTML = `
    <div class="setup-screen">
      <button class="back-button" id="back-home">
        ← Back
      </button>

      <h1>🃏 My Decks</h1>

      <p class="setup-subtitle">
        Your saved card decks will appear here.
      </p>

      <div id="saved-decks-list">
        <div class="empty-message">
          🏴‍☠️ Loading your card treasure...
        </div>
      </div>
    </div>
  `;

  document.querySelector('#back-home').addEventListener('click', showHome);

  const deckList = document.querySelector('#saved-decks-list');

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Could not load saved decks:', error);

    deckList.innerHTML = `
      <div class="empty-message">
        🏴‍☠️ Couldn't load your card decks.
      </div>
    `;

    return;
  }

  if (!data || data.length === 0) {
    deckList.innerHTML = `
      <div class="empty-message">
        🃏 You haven't saved any decks yet!
      </div>
    `;

    return;
  }

  deckList.innerHTML = data
    .map(
      (deck) => `
        <div class="saved-board-card">
          <div class="saved-board-info">
            <h2>
              🃏 ${escapeHtml(deck.name || 'Unnamed Deck')}
            </h2>

            <p>
              ${Array.isArray(deck.cards) ? deck.cards.length : 0} cards
            </p>

            <p>
              Saved ${new Date(deck.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      `
    )
    .join('');
}

async function showMyBoards() {
  app.innerHTML = `
    <div class="setup-screen">

      <button class="back-button" id="back-home">
        ← Back
      </button>

      <h1>📚 My Boards</h1>

      <p class="setup-subtitle">
        Your saved game boards will appear here.
      </p>

      <div id="saved-boards-list">
        <div class="empty-message">
          🏴‍☠️ Loading your treasure maps...
        </div>
      </div>

    </div>
  `;

  document.querySelector('#back-home').addEventListener('click', showHome);

  const boardList = document.querySelector('#saved-boards-list');

  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('status', 'saved')
    .order('created_at', {
      ascending: false,
    });

  if (error) {
    console.error('Could not load saved boards:', error);

    boardList.innerHTML = `
      <div class="empty-message">
        🏴‍☠️ Couldn't load your treasure maps.
      </div>
    `;

    return;
  }

  if (!data || data.length === 0) {
    boardList.innerHTML = `
      <div class="empty-message">
        🗺️ You haven't saved any boards yet!
      </div>
    `;

    return;
  }

  boardList.innerHTML = data
    .map(
      (board) => `
        <div class="saved-board-card">

          <img
            src="${board.board_image}"
            alt="${escapeHtml(board.board_name || 'Saved Board')}"
          >

          <div class="saved-board-info">

          <h2>
            🗺️ ${escapeHtml(board.board_name || 'Unnamed Board')}
          </h2>
        
          <p>
            Saved ${new Date(board.created_at).toLocaleDateString()}
          </p>
        
          <div class="saved-board-actions">
  <button class="play-board-button" data-board-id="${board.id}">
    ▶️ Play
  </button>
  <button class="edit-board-button" data-board-id="${board.id}">
    ✏️ Edit
  </button>
  <button class="delete-board-button" data-board-id="${board.id}">
    🗑️ Delete
  </button>
</div>
        
        </div>

        </div>
      `
    )
    .join('');

  document.querySelectorAll('.edit-board-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const boardId = button.dataset.boardId;

      const { data: board, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', boardId)
        .single();

      if (error || !board) {
        console.error('Could not load board for editing:', error);
        alert('🏴‍☠️ Could not open this board for editing.');
        return;
      }

      game.boardImage = board.board_image;
      game.path = board.path || [];
      game.characters = board.characters || [];
      game.customCards = board.cards || [];
      game.editingBoardId = board.id;
      game.roomCode = '';

      game.selectedCharacter = null;
      game.players = [];
      game.editingBoard = true;

      showCreateGame();

      const subtitle = document.querySelector('.setup-subtitle');

      if (subtitle) {
        subtitle.textContent = '🏴‍☠️ Edit your treasure map, crew, and cards!';
      }
    });
  });

  document.querySelectorAll('.delete-board-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const boardId = button.dataset.boardId;

      const confirmed = window.confirm(
        '🏴‍☠️ Are you sure you want to delete this board?'
      );

      if (!confirmed) {
        return;
      }

      const { error } = await supabase.from('rooms').delete().eq('id', boardId);

      if (error) {
        console.error('Could not delete board:', error);

        alert(`Could not delete board: ${error.message}`);

        return;
      }

      await showMyBoards();
    });
  });
  document.querySelectorAll('.play-board-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const boardId = button.dataset.boardId;

      const { data: board, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', boardId)
        .single();

      if (error || !board) {
        console.error('Could not load board:', error);
        alert('🏴‍☠️ Could not load this board.');
        return;
      }

      // Load everything saved with the board.
      game.boardImage = board.board_image;
      game.path = board.path || [];
      game.characters = board.characters || [];
      game.customCards = board.cards || [];
      game.roomCode = '';

      // Start fresh with no player selected yet.
      game.selectedCharacter = null;
      game.players = [];

      // Show character selection without rebuilding the board/path.
      app.innerHTML = `
        <div class="setup-screen">
          <button class="back-button" id="back-my-boards">
            ← Back
          </button>
  
          <h1>🏴‍☠️ Choose Your Pirate</h1>
  
          <p class="setup-subtitle">
            Choose your character and set sail!
          </p>
  
          <div class="setup-section">
            <h2>👤 Your Character</h2>
  
            <div id="saved-character-list" class="character-grid"></div>
          </div>
  
          <div class="setup-actions">
            <button id="start-saved-game" class="primary-button">
              Start Game → 
            </button>
          </div>
        </div>
      `;

      const characterList = document.querySelector('#saved-character-list');

      if (!game.characters.length) {
        characterList.innerHTML = `
          <div class="empty-message">
            🏴‍☠️ This board has no characters saved with it.
          </div>
        `;
      } else {
        characterList.innerHTML = game.characters
          .map(
            (character, index) => `
              <button
                class="character-option"
                data-character-index="${index}"
                type="button"
              >
              <img
              src="${character.image}"
              alt="${escapeHtml(character.name || `Character ${index + 1}`)}"
              style="width: 100px; height: 100px; object-fit: contain; display: block; margin: 0 auto;"
            >
                <span>
                  ${escapeHtml(character.name || `Character ${index + 1}`)}
                </span>
              </button>
            `
          )
          .join('');
      }

      document
        .querySelector('#back-my-boards')
        .addEventListener('click', showMyBoards);

      document.querySelectorAll('.character-option').forEach((option) => {
        option.addEventListener('click', () => {
          const index = Number(option.dataset.characterIndex);

          game.selectedCharacter = index;

          document.querySelectorAll('.character-option').forEach((item) => {
            item.classList.remove('selected');
          });

          option.classList.add('selected');
        });
      });

      document
        .querySelector('#start-saved-game')
        .addEventListener('click', () => {
          if (game.selectedCharacter === null) {
            alert('🏴‍☠️ Choose a character before setting sail!');
            return;
          }

          showGameBoard();
        });
    });
  });
}

/* =========================================================
   CREATE GAME
   ========================================================= */

function showCreateGame() {
  if (game.customCards.length === 0) {
    game.customCards = defaultCards.map((card) => ({
      ...card,
    }));
  }

  app.innerHTML = `
      <div class="setup-screen">
  
        <button class="back-button" id="back-home">
          ← Back
        </button>
  
        <h1>Create Game</h1>
  
        <p class="setup-subtitle">
          Set up your board game before inviting your friends.
        </p>
  
        <div class="setup-section">
          <h2>🗺️ Board</h2>
  
          <label class="upload-box" for="board-upload">
            <span class="upload-icon">📷</span>
            <strong>Upload Board</strong>
            <span>PNG or JPEG</span>
          </label>
  
          <input
            type="file"
            id="board-upload"
            accept="image/png, image/jpeg"
            hidden
          />
  
          <div id="board-preview"></div>
        </div>
  
        <div class="setup-section">
          <h2>👾 Characters</h2>
  
          <label class="upload-box" for="character-upload">
            <span class="upload-icon">➕</span>
            <strong>Add Characters</strong>
            <span>Upload up to 6 PNG or JPEG images</span>
          </label>
  
          <input
            type="file"
            id="character-upload"
            accept="image/png, image/jpeg"
            multiple
            hidden
          />
  
          <div id="character-list"></div>
        </div>
  
        <div class="setup-section">
          <h2>🎮 Your Character</h2>
  
          <p>Select which character you want to play as.</p>
  
          <div id="character-selection">
            <p class="empty-message">
              Upload some characters first.
            </p>
          </div>
        </div>
  
        <div class="setup-section">
  <h2>🎴 Cards</h2>

  <p>
    Customize the cards that players can draw during the game.
  </p>

  <button
    id="load-saved-deck-button"
    class="toolbar-button"
    style="
      width: 100%;
      font-size: 17px;
      margin-top: 10px;
    "
  >
    🃏 Load Saved Deck
  </button>

  <div
    id="saved-deck-picker"
    style="
      display: none;
      margin-top: 14px;
      padding: 16px;
      background: #fff0bd;
      border: 3px solid #f6b928;
      border-radius: 16px;
    "
  >
    <label
      for="saved-deck-select"
      style="
        display: block;
        margin-bottom: 8px;
        font-weight: 900;
        color: #70482d;
      "
    >
      Choose a saved deck:
    </label>

    <select
      id="saved-deck-select"
      style="
        width: 100%;
        box-sizing: border-box;
        padding: 12px;
        border: 2px solid #c98512;
        border-radius: 10px;
        font-size: 16px;
        font-family: inherit;
        background: white;
      "
    >
      <option value="">
        🏴‍☠️ Loading your decks...
      </option>
    </select>

    <button
      id="use-saved-deck-button"
      class="primary-button"
      style="
        width: 100%;
        margin-top: 12px;
      "
    >
      🃏 Load This Deck
    </button>
  </div>

  <button
    id="toggle-card-editor"
    class="toolbar-button"
    style="
      width: 100%;
      font-size: 17px;
      margin-top: 10px;
    "
  >
    ▼ View/Edit Cards (${game.customCards.length})
  </button>

  <div
    id="card-editor-wrapper"
    style="
      display: none;
      margin-top: 16px;
    "
  >
    <div id="card-editor"></div>

    <div style="margin-top: 16px; text-align: center;">
      <button id="save-deck-button" class="primary-button">
        🃏 Save Deck
      </button>
    </div>

    <button
      id="add-card"
      class="toolbar-button"
      style="
        margin-top: 18px;
        width: 100%;
        font-size: 17px;
      "
    >
      ➕ Add Card
    </button>
  </div>
</div>
  
        <button class="primary-button" id="continue-setup">
          Continue to Board Setup →
        </button>
  
      </div>
    `;

  document.querySelector('#back-home').addEventListener('click', showHome);

  setupBoardUpload();
  setupCharacterUpload();
  setupCardCustomization();

  document
    .querySelector('#continue-setup')
    .addEventListener('click', showPathBuilder);
}

/* =========================================================
   BOARD UPLOAD
   ========================================================= */

async function setupBoardUpload() {
  const upload = document.querySelector('#board-upload');
  const preview = document.querySelector('#board-preview');

  if (game.boardImage) {
    preview.innerHTML = `
        <div class="board-preview-wrapper">
          <img
            src="${game.boardImage}"
            alt="Uploaded game board"
          >
          <p>✓ Board uploaded</p>
        </div>
      `;
  }

  upload.addEventListener('change', async () => {
    const file = upload.files[0];

    if (!file) {
      return;
    }

    preview.innerHTML = `
        <div class="board-preview-wrapper">
          <p>🏴‍☠️ Uploading your treasure map...</p>
        </div>
      `;

    const fileName = `${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('board-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Board image upload failed:', uploadError);

      preview.innerHTML = `
          <div class="board-preview-wrapper">
            <p>❌ Could not upload the board.</p>
          </div>
        `;

      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from('board-images')
      .getPublicUrl(fileName);

    game.boardImage = publicUrlData.publicUrl;

    preview.innerHTML = `
        <div class="board-preview-wrapper">
          <img
            src="${game.boardImage}"
            alt="Uploaded game board"
          >
          <p>✓ Board uploaded</p>
        </div>
      `;

    console.log('Board image uploaded!', game.boardImage);
  });
}

/* =========================================================
   RENDER CHARACTERS
   ========================================================= */

function renderCharacterSetup() {
  const list = document.querySelector('#character-list');
  const selection = document.querySelector('#character-selection');

  if (!list || !selection) {
    return;
  }

  if (game.characters.length === 0) {
    list.innerHTML = '';

    selection.innerHTML = `
      <p class="empty-message">
        Upload some characters first.
      </p>
    `;

    return;
  }

  list.innerHTML = '';

  game.characters.forEach((character, index) => {
    const displayName = character.name || `Character ${index + 1}`;

    list.innerHTML += `
      <div class="character-card">
        <img
          src="${character.image}"
          alt="${escapeHtml(displayName)}"
        >

        <div class="character-name-area">
          <span>Character ${index + 1}</span>

          <input
            type="text"
            class="character-name-input"
            data-character-index="${index}"
            value="${escapeHtml(displayName)}"
            placeholder="Character name"
          >
        </div>
      </div>
    `;
  });

  selection.innerHTML = '';

  game.characters.forEach((character, index) => {
    const displayName = character.name || `Character ${index + 1}`;

    selection.innerHTML += `
      <label class="character-choice">
        <input
          type="radio"
          name="player-character"
          value="${index}"
          ${game.selectedCharacter === index ? 'checked' : ''}
        >

        <img
          src="${character.image}"
          alt="${escapeHtml(displayName)}"
        >

        <span>${escapeHtml(displayName)}</span>
      </label>
    `;
  });

  document.querySelectorAll('.character-name-input').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.characterIndex);

      game.characters[index].name = input.value;

      const selectedChoice = document.querySelector(
        `input[name="player-character"][value="${index}"]`
      );

      if (selectedChoice) {
        const choice = selectedChoice.closest('.character-choice');

        if (choice) {
          const nameSpan = choice.querySelector('span');

          if (nameSpan) {
            nameSpan.textContent = input.value || `Character ${index + 1}`;
          }
        }
      }
    });
  });

  document
    .querySelectorAll('input[name="player-character"]')
    .forEach((input) => {
      input.addEventListener('change', () => {
        game.selectedCharacter = Number(input.value);

        console.log('Selected character:', game.selectedCharacter);
      });
    });
}

/* =========================================================
   CHARACTER UPLOAD
   ========================================================= */

async function setupCharacterUpload() {
  const upload = document.querySelector('#character-upload');

  if (!upload) {
    return;
  }

  upload.addEventListener('change', async () => {
    const selectedFiles = Array.from(upload.files);

    if (selectedFiles.length === 0) {
      return;
    }

    const availableSlots = 6 - game.characters.length;

    if (availableSlots <= 0) {
      alert('You already have 6 characters. That is the maximum!');
      upload.value = '';
      return;
    }

    const filesToAdd = selectedFiles.slice(0, availableSlots);

    if (selectedFiles.length > availableSlots) {
      alert(
        `You can only have 6 characters. I added the first ${availableSlots} character${
          availableSlots === 1 ? '' : 's'
        }.`
      );
    }

    upload.disabled = true;

    try {
      for (const file of filesToAdd) {
        const fileExtension = file.name.split('.').pop();
        const safeFileName = `${crypto.randomUUID()}.${fileExtension}`;

        const { error: uploadError } = await supabase.storage
          .from('character-images')
          .upload(safeFileName, file);

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from('character-images')
          .getPublicUrl(safeFileName);

        const characterName = file.name.replace(/\.[^/.]+$/, '');

        game.characters.push({
          image: publicUrlData.publicUrl,
          name: characterName,
        });
      }

      renderCharacterSetup();
    } catch (error) {
      console.error('Character upload failed:', error);
      alert(`Could not upload character: ${error.message}`);
    } finally {
      upload.disabled = false;
      upload.value = '';
    }
  });

  renderCharacterSetup();
}

/* =========================================================
   CARD CUSTOMIZATION
   ========================================================= */

function setupCardCustomization() {
  renderCardEditor();

  const toggleButton = document.querySelector('#toggle-card-editor');
  const editorWrapper = document.querySelector('#card-editor-wrapper');

  if (toggleButton && editorWrapper) {
    toggleButton.addEventListener('click', () => {
      const isOpen = editorWrapper.style.display !== 'none';

      if (isOpen) {
        editorWrapper.style.display = 'none';
        toggleButton.textContent = `▼ View/Edit Cards (${game.customCards.length})`;
      } else {
        editorWrapper.style.display = 'block';
        toggleButton.textContent = `▲ Hide Cards (${game.customCards.length})`;
      }
    });
  }

  const addButton = document.querySelector('#add-card');

  if (addButton) {
    addButton.addEventListener('click', () => {
      const newId = Date.now();

      game.customCards.push({
        id: newId,
        title: 'New Card',
        text: 'Enter what happens when this card is drawn.',
        effect: 'none',
        amount: 0,
      });

      renderCardEditor();

      if (toggleButton) {
        const isOpen = editorWrapper && editorWrapper.style.display !== 'none';

        toggleButton.textContent = isOpen
          ? `▲ Hide Cards (${game.customCards.length})`
          : `▼ View/Edit Cards (${game.customCards.length})`;
      }
    });
  }

  const saveDeckButton = document.querySelector('#save-deck-button');

  if (saveDeckButton) {
    saveDeckButton.addEventListener('click', saveDeck);
  }

  const loadDeckButton = document.querySelector('#load-saved-deck-button');
  const deckPicker = document.querySelector('#saved-deck-picker');
  const deckSelect = document.querySelector('#saved-deck-select');
  const useDeckButton = document.querySelector('#use-saved-deck-button');

  if (loadDeckButton && deckPicker && deckSelect) {
    loadDeckButton.addEventListener('click', async () => {
      const isOpen = deckPicker.style.display !== 'none';

      if (isOpen) {
        deckPicker.style.display = 'none';
        loadDeckButton.textContent = '🃏 Load Saved Deck';
        return;
      }

      deckPicker.style.display = 'block';
      loadDeckButton.textContent = '▲ Hide Saved Decks';

      await loadSavedDeckOptions();
    });
  }

  if (useDeckButton && deckSelect) {
    useDeckButton.addEventListener('click', async () => {
      const deckId = deckSelect.value;

      if (!deckId) {
        alert('🏴‍☠️ Pick a deck first!');
        return;
      }

      const { data: deck, error } = await supabase
        .from('decks')
        .select('*')
        .eq('id', deckId)
        .single();

      if (error || !deck) {
        console.error('Could not load deck:', error);
        alert('🏴‍☠️ Could not load that deck.');
        return;
      }

      if (!Array.isArray(deck.cards) || deck.cards.length === 0) {
        alert('🏴‍☠️ That deck does not contain any cards.');
        return;
      }

      game.customCards = deck.cards.map((card) => ({
        ...card,
      }));

      renderCardEditor();

      if (toggleButton) {
        const isOpen = editorWrapper && editorWrapper.style.display !== 'none';

        toggleButton.textContent = isOpen
          ? `▲ Hide Cards (${game.customCards.length})`
          : `▼ View/Edit Cards (${game.customCards.length})`;
      }

      deckPicker.style.display = 'none';
      loadDeckButton.textContent = '🃏 Load Saved Deck';

      alert(`🏴‍☠️ "${deck.name}" loaded successfully!`);
    });
  }
}

async function loadSavedDeckOptions() {
  const deckSelect = document.querySelector('#saved-deck-select');

  if (!deckSelect) {
    return;
  }

  deckSelect.innerHTML = `
      <option value="">
        🏴‍☠️ Choose a deck...
      </option>
    `;

  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Could not load saved decks:', error);

    deckSelect.innerHTML = `
        <option value="">
          ❌ Could not load decks
        </option>
      `;

    return;
  }

  if (!data || data.length === 0) {
    deckSelect.innerHTML = `
        <option value="">
          🃏 No saved decks yet
        </option>
      `;

    return;
  }

  data.forEach((deck) => {
    const option = document.createElement('option');

    option.value = deck.id;
    option.textContent = `🃏 ${deck.name} (${
      Array.isArray(deck.cards) ? deck.cards.length : 0
    } cards)`;

    deckSelect.appendChild(option);
  });
}

function renderCardEditor() {
  const editor = document.querySelector('#card-editor');

  if (!editor) {
    return;
  }

  editor.innerHTML = '';

  game.customCards.forEach((card, index) => {
    const cardElement = document.createElement('div');

    cardElement.style.background = '#fff9e8';
    cardElement.style.border = '3px solid #f6b928';
    cardElement.style.borderRadius = '18px';
    cardElement.style.padding = '18px';
    cardElement.style.marginBottom = '14px';
    cardElement.style.boxShadow = '0 4px 0 #c98512';

    cardElement.innerHTML = `
        <div
          style="
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
          "
        >
          <strong
            style="
              color: #183b52;
              font-size: 18px;
            "
          >
            🎴 Card ${index + 1}
          </strong>
  
          <button
            class="delete-card-button"
            data-card-index="${index}"
            style="
              border: 2px solid #d94d43;
              border-radius: 10px;
              background: #ef6b5b;
              color: white;
              padding: 7px 10px;
              font-weight: 900;
              cursor: pointer;
            "
          >
            🗑️ Delete
          </button>
        </div>
  
        <label
          style="
            display: block;
            margin-bottom: 6px;
            color: #70482d;
            font-weight: 900;
          "
        >
          Card Title
        </label>
  
        <input
          type="text"
          class="card-title-input"
          data-card-index="${index}"
          value="${escapeHtml(card.title)}"
          placeholder="Card title"
          style="
            width: 100%;
            box-sizing: border-box;
            padding: 11px;
            margin-bottom: 14px;
            border: 2px solid #c98512;
            border-radius: 10px;
            font-size: 16px;
            font-family: inherit;
          "
        >
  
        <label
          style="
            display: block;
            margin-bottom: 6px;
            color: #70482d;
            font-weight: 900;
          "
        >
          Card Message
        </label>
  
        <textarea
          class="card-text-input"
          data-card-index="${index}"
          placeholder="What should the card say?"
          rows="3"
          style="
            width: 100%;
            box-sizing: border-box;
            padding: 11px;
            margin-bottom: 14px;
            border: 2px solid #c98512;
            border-radius: 10px;
            font-size: 16px;
            font-family: inherit;
            resize: vertical;
          "
        >${escapeHtml(card.text)}</textarea>
  
        <label
          style="
            display: block;
            margin-bottom: 6px;
            color: #70482d;
            font-weight: 900;
          "
        >
          Card Effect
        </label>
  
        <select
          class="card-effect-input"
          data-card-index="${index}"
          style="
            width: 100%;
            box-sizing: border-box;
            padding: 11px;
            margin-bottom: 14px;
            border: 2px solid #c98512;
            border-radius: 10px;
            font-size: 16px;
            font-family: inherit;
            background: white;
          "
        >
          <option
            value="none"
            ${card.effect === 'none' ? 'selected' : ''}
          >
            💬 Message Only
          </option>
  
          <option
            value="move"
            ${card.effect === 'move' ? 'selected' : ''}
          >
            ➡️ Move
          </option>
  
          <option
            value="skip"
            ${card.effect === 'skip' ? 'selected' : ''}
          >
            ⏭️ Skip Next Turn
          </option>
  
          <option
            value="reroll"
            ${card.effect === 'reroll' ? 'selected' : ''}
          >
            🎲 Roll Again
          </option>
        </select>
  
        <label
          style="
            display: block;
            margin-bottom: 6px;
            color: #70482d;
            font-weight: 900;
          "
        >
          Effect Amount
        </label>
  
        <input
          type="number"
          class="card-amount-input"
          data-card-index="${index}"
          value="${card.amount ?? 0}"
          style="
            width: 100%;
            box-sizing: border-box;
            padding: 11px;
            border: 2px solid #c98512;
            border-radius: 10px;
            font-size: 16px;
            font-family: inherit;
          "
        >
      `;

    editor.appendChild(cardElement);
  });

  document.querySelectorAll('.card-title-input').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.cardIndex);

      if (!game.customCards[index]) {
        return;
      }

      game.customCards[index].title = input.value;
    });
  });

  document.querySelectorAll('.card-text-input').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.cardIndex);

      if (!game.customCards[index]) {
        return;
      }

      game.customCards[index].text = input.value;
    });
  });

  document.querySelectorAll('.card-effect-input').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.cardIndex);

      if (!game.customCards[index]) {
        return;
      }

      game.customCards[index].effect = input.value;
    });
  });

  document.querySelectorAll('.card-amount-input').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.cardIndex);

      if (!game.customCards[index]) {
        return;
      }

      game.customCards[index].amount = Number(input.value);
    });
  });

  document.querySelectorAll('.delete-card-button').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.cardIndex);

      game.customCards.splice(index, 1);

      renderCardEditor();

      const toggleButton = document.querySelector('#toggle-card-editor');
      const editorWrapper = document.querySelector('#card-editor-wrapper');

      if (toggleButton) {
        const isOpen = editorWrapper && editorWrapper.style.display !== 'none';

        toggleButton.textContent = isOpen
          ? `▲ Hide Cards (${game.customCards.length})`
          : `▼ View/Edit Cards (${game.customCards.length})`;
      }
    });
  });
}

async function saveDeck() {
  if (!game.customCards || game.customCards.length === 0) {
    alert('🏴‍☠️ Add at least one card before saving your deck.');
    return;
  }

  const deckName = window.prompt('🃏 Name your deck:', 'My Deck');

  if (deckName === null) {
    return;
  }

  const trimmedName = deckName.trim();

  if (!trimmedName) {
    alert('Please enter a deck name.');
    return;
  }

  const { data, error } = await supabase
    .from('decks')
    .insert({
      name: trimmedName,
      cards: game.customCards,
    })
    .select()
    .single();

  if (error) {
    console.error('Deck save failed:', error);
    alert(`Could not save deck: ${error.message}`);
    return;
  }

  console.log('Deck saved!', data);

  alert(`🏴‍☠️ "${trimmedName}" was saved successfully!`);
}

/* =========================================================
   PATH BUILDER
   ========================================================= */

function showPathBuilder() {
  if (!game.boardImage) {
    alert('Please upload a board first!');
    return;
  }

  if (!game.editingBoard) {
    game.path = [];
  }

  game.editMode = false;

  game.selectedSpaceIndex = null;

  game.draggingSpaceIndex = null;

  game.branchMode = false;

  game.branchStartIndex = null;

  game.routeMode = false;

  game.routeStartIndex = null;

  app.innerHTML = `
    <div class="path-builder">

      <div class="path-toolbar">

        <div>
          <button
            id="back-setup"
            class="toolbar-button"
          >
            ← Back
          </button>

          <strong class="builder-title">
            🗺️ Board Path Builder
          </strong>
        </div>

        <div class="path-tools">

          <div class="space-size-control">

            <span>
              Space Size:
            </span>

            <button
              id="smaller-space"
              class="toolbar-button"
            >
              −
            </button>

            <span id="space-size-label">
              Medium
            </span>

            <button
              id="larger-space"
              class="toolbar-button"
            >
              +
            </button>

          </div>

          <button
            id="add-space"
            class="toolbar-button active"
          >
            📍 Add Space
          </button>

          <button
            id="add-route"
            class="toolbar-button"
          >
            🌿 Add Route
          </button>

          <button
  id="draw-card"
  class="toolbar-button"
>
  🃏 Draw Card
</button>

          <button
            id="edit-space"
            class="toolbar-button"
          >
            ✏️ Edit Space
          </button>

          <button
          id="add-branch"
          class="toolbar-button"
        >
          🔀 Add Branch
        </button>

        <button
          id="connect-paths"
          class="toolbar-button"
        >
          🔗 Connect Paths
        </button>

        <button
          id="delete-space"
          class="toolbar-button"
        >
            🗑 Delete Space
          </button>

          <button
            id="undo-space"
            class="toolbar-button"
          >
            ↩ Undo
          </button>

          <button
            id="clear-path"
            class="toolbar-button"
          >
            🗑 Clear
          </button>

        </div>
      </div>

      <div class="builder-info">

        <strong id="builder-instruction">
          Click along the board to create the path.
        </strong>

        <span id="path-count">
          0 spaces
        </span>

      </div>

      <div class="board-builder-area">

        <div class="board-canvas">

          <img
            id="builder-board"
            src="${game.boardImage}"
            alt="Board being configured"
          >

          <div id="path-overlay"></div>

        </div>

      </div>

      <div class="builder-bottom">

        <div>
          <span id="path-status">
            Click the starting position.
          </span>
        </div>

        <div class="builder-actions">

  <button
    id="save-path"
    class="primary-button"
  >
    Save Path →
  </button>

  <button
    id="save-board"
    class="primary-button"
  >
    💾 Save Board
  </button>

</div>

      </div>

    </div>
  `;

  document
    .querySelector('#back-setup')
    .addEventListener('click', showCreateGame);

  document.querySelector('#smaller-space').addEventListener('click', () => {
    game.spaceSize = Math.max(20, game.spaceSize - 4);

    updateSpaceSizeLabel();

    renderPath();
  });

  document.querySelector('#larger-space').addEventListener('click', () => {
    game.spaceSize = Math.min(60, game.spaceSize + 4);

    updateSpaceSizeLabel();

    renderPath();
  });

  /* -------------------------------------------------------
     NORMAL ADD SPACE
     ------------------------------------------------------- */

  document.querySelector('#add-space').addEventListener('click', () => {
    game.editMode = false;

    game.branchMode = false;

    game.branchStartIndex = null;

    game.routeMode = false;

    game.routeStartIndex = null;

    game.drawCardMode = false;

    game.selectedSpaceIndex = null;

    setActiveTool('add-space');

    document.querySelector('#builder-instruction').textContent =
      'Click along the board to create the path.';

    document.querySelector('#path-status').textContent =
      game.path.length === 0
        ? 'Click the starting position.'
        : 'Click to add the next space.';

    renderPath();
  });

  /* -------------------------------------------------------
     ADD ROUTE
     ------------------------------------------------------- */

  document.querySelector('#add-route').addEventListener('click', () => {
    if (game.path.length === 0) {
      alert('Create at least one space before adding a route.');

      return;
    }

    const routeName = window.prompt('🌿 Name this route:', 'Shortcut');

    if (routeName === null) {
      return;
    }

    const trimmedName = routeName.trim();

    if (!trimmedName) {
      alert('Please enter a name for the route.');

      return;
    }

    game.editMode = false;

    game.branchMode = false;

    game.branchStartIndex = null;

    game.connectMode = false;

    game.connectStartIndex = null;

    game.routeMode = true;

    game.routeStartIndex = null;

    game.routeName = trimmedName;

    game.selectedSpaceIndex = null;

    setActiveTool('add-route');

    document.querySelector(
      '#builder-instruction'
    ).textContent = `Click the space where "${trimmedName}" should begin.`;

    document.querySelector(
      '#path-status'
    ).textContent = `Building route: ${trimmedName}`;

    renderPath();
  });

  /* -------------------------------------------------------
   DRAW CARD
   ------------------------------------------------------- */

  document.querySelector('#draw-card').addEventListener('click', () => {
    game.editMode = false;
    game.branchMode = false;
    game.branchStartIndex = null;
    game.routeMode = false;
    game.routeStartIndex = null;
    game.connectMode = false;
    game.connectStartIndex = null;

    game.drawCardMode = true;

    game.selectedSpaceIndex = null;

    setActiveTool('draw-card');

    const instruction = document.querySelector('#builder-instruction');

    const status = document.querySelector('#path-status');

    if (instruction) {
      instruction.textContent =
        '🎴 Click a space to make it a Draw Card space.';
    }

    if (status) {
      status.textContent = '🎴 Draw Card mode is active.';
    }

    renderPath();
  });

  /* -------------------------------------------------------
     EDIT SPACE
     ------------------------------------------------------- */

  document.querySelector('#edit-space').addEventListener('click', () => {
    game.editMode = true;

    game.branchMode = false;

    game.branchStartIndex = null;

    game.routeMode = false;

    game.routeStartIndex = null;

    game.selectedSpaceIndex = null;

    setActiveTool('edit-space');

    document.querySelector('#builder-instruction').textContent =
      'Drag a numbered space to move it.';

    document.querySelector('#path-status').textContent =
      game.path.length === 0
        ? 'There are no spaces to edit yet.'
        : 'Drag any numbered space to move it.';

    renderPath();
  });

  /* -------------------------------------------------------
     ADD BRANCH
     ------------------------------------------------------- */

  document.querySelector('#add-branch').addEventListener('click', () => {
    if (game.path.length < 2) {
      alert('Create at least two spaces before adding a branch.');

      return;
    }

    game.editMode = false;

    game.branchMode = true;

    game.branchStartIndex = null;

    game.routeMode = false;

    game.routeStartIndex = null;

    game.selectedSpaceIndex = null;

    setActiveTool('add-branch');

    document.querySelector('#builder-instruction').textContent =
      'Click the space where the branch should start.';

    document.querySelector('#path-status').textContent =
      'Choose the starting space for your branch.';

    renderPath();
  });

  /* -------------------------------------------------------
     CONNECT PATHS
     ------------------------------------------------------- */

  document.querySelector('#connect-paths').addEventListener('click', () => {
    if (game.path.length < 2) {
      alert('Create at least two spaces before connecting paths.');

      return;
    }

    game.editMode = false;

    game.branchMode = false;

    game.branchStartIndex = null;

    game.routeMode = false;

    game.routeStartIndex = null;

    game.connectMode = true;

    game.connectStartIndex = null;

    game.selectedSpaceIndex = null;

    setActiveTool('connect-paths');

    document.querySelector('#builder-instruction').textContent =
      'Click the first space you want to connect.';

    document.querySelector('#path-status').textContent =
      'Choose the starting space.';

    renderPath();
  });

  document
    .querySelector('#delete-space')
    .addEventListener('click', deleteSelectedSpace);

  document
    .querySelector('#undo-space')
    .addEventListener('click', undoPathSpace);

  document.querySelector('#clear-path').addEventListener('click', clearPath);

  document.querySelector('#save-path').addEventListener('click', savePath);

  document.querySelector('#save-board').addEventListener('click', saveBoard);

  const board = document.querySelector('#builder-board');

  const overlay = document.querySelector('#path-overlay');

  board.addEventListener('load', () => {
    renderPath();
  });

  /*
    Normal board clicks create normal
    spaces.

    Route clicks are handled by
    the overlay because the overlay
    sits above the board image.
  */

  board.addEventListener('click', (event) => {
    if (game.routeMode) {
      return;
    }

    createPathSpace(event);
  });

  /*
    Empty-board clicks during Route Mode
    come through the overlay.
  */

  overlay.addEventListener('click', (event) => {
    if (game.routeMode && game.routeStartIndex !== null) {
      addRouteSpace(event);
    }
  });

  window.addEventListener('resize', renderPath);
}

/* =========================================================
   SET ACTIVE TOOL
   ========================================================= */

function setActiveTool(toolId) {
  document
    .querySelectorAll('.path-tools > .toolbar-button')
    .forEach((button) => {
      button.classList.remove('active');
    });

  const tool = document.querySelector(`#${toolId}`);

  if (tool) {
    tool.classList.add('active');
  }
}

/* =========================================================
   CREATE NORMAL PATH SPACE
   ========================================================= */

function createPathSpace(event) {
  if (game.editMode) {
    return;
  }

  if (game.branchMode) {
    return;
  }

  if (game.routeMode) {
    return;
  }

  if (game.drawCardMode) {
    return;
  }

  const board = event.currentTarget;

  const rectangle = board.getBoundingClientRect();

  const x = ((event.clientX - rectangle.left) / rectangle.width) * 100;

  const y = ((event.clientY - rectangle.top) / rectangle.height) * 100;

  const newIndex = game.path.length;

  const newSpace = {
    number: newIndex + 1,

    x,
    y,

    connections: [],
  };

  /*
    Connect the previous space
    to the new space.

    Example:

    1 → 2 → 3 → 4
  */

  if (game.path.length > 0) {
    game.path[game.path.length - 1].connections.push({
      target: newIndex,
      type: 'normal',
    });
  }

  game.path.push(newSpace);

  renderPath();

  const status = document.querySelector('#path-status');

  if (game.path.length === 1) {
    status.textContent = '✓ Start created. Click to add the next space.';
  } else {
    status.textContent = `Space ${game.path.length} created. Keep going!`;
  }
}

/* =========================================================
   ADD ROUTE SPACE
   ========================================================= */

function addRouteSpace(event) {
  const board = document.querySelector('#builder-board');

  if (!board) {
    return;
  }

  const rectangle = board.getBoundingClientRect();

  const x = ((event.clientX - rectangle.left) / rectangle.width) * 100;

  const y = ((event.clientY - rectangle.top) / rectangle.height) * 100;

  const newIndex = game.path.length;

  const newSpace = {
    number: newIndex + 1,

    x,
    y,

    connections: [],
  };

  /*
    Connect the current route
    endpoint to the new space.

    Example:

    4 → 5
    5 → 6
    6 → 7
  */

  if (game.routeStartIndex !== null && game.path[game.routeStartIndex]) {
    const currentSpace = game.path[game.routeStartIndex];

    const alreadyConnected = currentSpace.connections.some(
      (connection) => connection.target === newIndex
    );

    if (!alreadyConnected) {
      currentSpace.connections.push({
        target: newIndex,
        type: 'normal',
        routeName: game.routeName,
      });
    }
  }

  game.path.push(newSpace);

  /*
    The new space becomes the
    endpoint of the route.

    So clicking again creates:

    4 → 5 → 6 → 7
  */

  game.routeStartIndex = newIndex;

  renderPath();

  const instruction = document.querySelector('#builder-instruction');

  const status = document.querySelector('#path-status');

  if (instruction) {
    instruction.textContent = `Route continues from Space ${newSpace.number}. Click the board to add the next space.`;
  }

  if (status) {
    status.textContent = `✓ Space ${newSpace.number} added to the route. Keep going!`;
  }
}

/* =========================================================
   HANDLE ROUTE START
   ========================================================= */

function selectRouteStart(index) {
  game.routeStartIndex = index;

  const space = game.path[index];

  const instruction = document.querySelector('#builder-instruction');

  const status = document.querySelector('#path-status');

  if (instruction) {
    instruction.textContent = `Space ${space.number} selected. Now click where the new route should go.`;
  }

  if (status) {
    status.textContent = `🌿 New route starts at Space ${space.number}. Click the board to create the next space.`;
  }

  renderPath();
}

/* =========================================================
   CREATE BRANCH
   ========================================================= */

function createBranch(startIndex, destinationIndex) {
  const startSpace = game.path[startIndex];

  const destinationSpace = game.path[destinationIndex];

  if (!startSpace || !destinationSpace) {
    return;
  }

  if (startIndex === destinationIndex) {
    return;
  }

  const alreadyConnected = startSpace.connections.some(
    (connection) => connection.target === destinationIndex
  );

  if (alreadyConnected) {
    alert(
      `Space ${startSpace.number} is already connected to Space ${destinationSpace.number}.`
    );

    return;
  }

  const branchName = window.prompt('🔀 Name this shortcut:', 'Dirt Path');

  if (branchName === null) {
    return;
  }

  const trimmedName = branchName.trim();

  if (!trimmedName) {
    alert('Please enter a name for the shortcut.');

    return;
  }

  startSpace.connections.push({
    target: destinationIndex,
    type: 'optional',
    routeName: trimmedName,
  });

  renderPath();

  const instruction = document.querySelector('#builder-instruction');

  const status = document.querySelector('#path-status');

  if (instruction) {
    instruction.textContent =
      'Shortcut created! Click another space to create another shortcut.';
  }

  if (status) {
    status.textContent = `🔀 "${trimmedName}": Space ${startSpace.number} → Space ${destinationSpace.number}.`;
  }
}

/* =========================================================
   RENDER PATH
   ========================================================= */

function renderPath() {
  const board = document.querySelector('#builder-board');

  const overlay = document.querySelector('#path-overlay');

  if (!board || !overlay) {
    return;
  }

  const boardRectangle = board.getBoundingClientRect();

  const boardWidth = boardRectangle.width;

  const boardHeight = boardRectangle.height;

  /*
    IMPORTANT:
    The board canvas has 7px of padding.
    These values keep the path circles
    perfectly aligned with the board.
  */

  overlay.style.width = `${boardWidth}px`;

  overlay.style.height = `${boardHeight}px`;

  overlay.style.left = '7px';

  overlay.style.top = '7px';

  overlay.style.pointerEvents =
    game.editMode || game.branchMode || game.routeMode || game.drawCardMode
      ? 'auto'
      : 'none';

  overlay.innerHTML = '';

  /* =======================================================
     ALL STORED CONNECTION LINES
     ======================================================= */

  game.path.forEach((space) => {
    if (!space.connections || space.connections.length === 0) {
      return;
    }

    space.connections.forEach((connection) => {
      const destination = game.path[connection.target];

      if (!destination) {
        return;
      }

      const x1 = (space.x / 100) * boardWidth;

      const y1 = (space.y / 100) * boardHeight;

      const x2 = (destination.x / 100) * boardWidth;

      const y2 = (destination.y / 100) * boardHeight;

      const dx = x2 - x1;

      const dy = y2 - y1;

      const distance = Math.sqrt(dx * dx + dy * dy);

      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const line = document.createElement('div');

      line.className = 'path-line';

      if (connection.type === 'optional') {
        line.classList.add('branch-line');

        line.style.borderTop = '4px dashed #126b83';

        line.style.background = 'transparent';

        line.style.height = '0px';
      } else if (connection.type === 'choice') {
        line.classList.add('branch-line');

        line.style.background = '#ef6b5b';

        line.style.height = '5px';
      }

      line.style.width = `${distance}px`;

      line.style.left = `${x1}px`;

      line.style.top = `${y1}px`;

      line.style.transform = `rotate(${angle}deg)`;

      line.style.transformOrigin = 'left center';

      line.style.zIndex = '5';

      /*
            Lines should never prevent
            empty-board clicks.
          */

      line.style.pointerEvents = 'none';

      overlay.appendChild(line);

      /* -------------------------------------------------
             BRANCH LABEL
             ------------------------------------------------- */

      if (connection.type === 'optional' || connection.type === 'choice') {
        const branchLabel = document.createElement('div');

        branchLabel.className = 'branch-label';

        branchLabel.textContent = connection.type === 'optional' ? '🔀' : '⚔️';

        branchLabel.style.position = 'absolute';

        branchLabel.style.left = `${(x1 + x2) / 2}px`;

        branchLabel.style.top = `${(y1 + y2) / 2}px`;

        branchLabel.style.transform = 'translate(-50%, -50%)';

        branchLabel.style.width = '28px';

        branchLabel.style.height = '28px';

        branchLabel.style.display = 'flex';

        branchLabel.style.alignItems = 'center';

        branchLabel.style.justifyContent = 'center';

        branchLabel.style.background = '#fff9e8';

        branchLabel.style.border =
          connection.type === 'optional'
            ? '2px dashed #126b83'
            : '2px solid #ef6b5b';

        branchLabel.style.borderRadius = '50%';

        branchLabel.style.fontSize = '16px';

        branchLabel.style.zIndex = '10';

        branchLabel.style.pointerEvents = 'none';

        overlay.appendChild(branchLabel);
      }
    });
  });

  /* =======================================================
     NUMBERED SPACES
     ======================================================= */

  game.path.forEach((space, index) => {
    const marker = document.createElement('div');

    marker.className = 'path-marker';

    if (index === 0) {
      marker.classList.add('start-marker');
    }

    if (space.drawCard) {
      marker.textContent = '🎴';

      marker.style.background = '#ef6b5b';

      marker.style.border = '3px solid #d94d43';

      marker.style.fontSize = '18px';

      marker.style.color = '#ffffff';

      marker.style.boxShadow = '0 3px 0 #b83d35';
    }

    if (index === game.path.length - 1) {
      marker.classList.add('finish-marker');
    }

    if (index === game.selectedSpaceIndex) {
      marker.classList.add('selected-marker');
    }

    if (game.routeMode && index === game.routeStartIndex) {
      marker.classList.add('selected-marker');
    }

    if (game.branchMode && index === game.branchStartIndex) {
      marker.classList.add('selected-marker');
    }

    marker.style.width = `${game.spaceSize}px`;

    marker.style.height = `${game.spaceSize}px`;

    marker.style.left = `${(space.x / 100) * boardWidth}px`;

    marker.style.top = `${(space.y / 100) * boardHeight}px`;

    marker.textContent = space.number;

    /* -----------------------------------------------------
   DRAW CARD MODE
   ----------------------------------------------------- */

    if (game.drawCardMode) {
      marker.style.pointerEvents = 'auto';

      marker.style.cursor = 'pointer';

      marker.addEventListener('click', (event) => {
        event.stopPropagation();

        space.drawCard = !space.drawCard;

        game.selectedSpaceIndex = index;

        renderPath();

        const instruction = document.querySelector('#builder-instruction');

        const status = document.querySelector('#path-status');

        if (space.drawCard) {
          if (instruction) {
            instruction.textContent = `🎴 Space ${space.number} is now a Draw Card space! Click another space to add another.`;
          }

          if (status) {
            status.textContent = `🎴 Space ${space.number} will draw a random card.`;
          }
        } else {
          if (instruction) {
            instruction.textContent = `🎴 Space ${space.number} is no longer a Draw Card space.`;
          }

          if (status) {
            status.textContent = `Space ${space.number} returned to normal.`;
          }
        }
      });
    }

    /* -----------------------------------------------------
         EDIT MODE
         ----------------------------------------------------- */

    if (game.editMode) {
      marker.style.pointerEvents = 'auto';

      marker.style.cursor = 'grab';

      marker.addEventListener('mousedown', startDraggingSpace);
    }

    /* -----------------------------------------------------
         BRANCH MODE
         ----------------------------------------------------- */

    if (game.branchMode) {
      marker.style.pointerEvents = 'auto';

      marker.style.cursor = 'pointer';

      marker.addEventListener('click', (event) => {
        event.stopPropagation();

        if (game.branchStartIndex === null) {
          game.branchStartIndex = index;

          const instruction = document.querySelector('#builder-instruction');

          const status = document.querySelector('#path-status');

          if (instruction) {
            instruction.textContent = `Space ${space.number} selected. Now click the space where the branch should go.`;
          }

          if (status) {
            status.textContent = `Branch starts at Space ${space.number}. Choose the destination space.`;
          }

          renderPath();

          return;
        }

        if (game.branchStartIndex === index) {
          return;
        }

        const startIndex = game.branchStartIndex;

        game.branchStartIndex = null;

        createBranch(startIndex, index);
      });
    }

    /* -----------------------------------------------------
         CONNECT PATHS MODE
         ----------------------------------------------------- */

    if (game.connectMode) {
      marker.style.pointerEvents = 'auto';

      marker.style.cursor = 'pointer';

      marker.addEventListener('click', (event) => {
        event.stopPropagation();

        /*
         * First click selects the
         * starting space.
         */

        if (game.connectStartIndex === null) {
          game.connectStartIndex = index;

          game.selectedSpaceIndex = index;

          const instruction = document.querySelector('#builder-instruction');

          const status = document.querySelector('#path-status');

          if (instruction) {
            instruction.textContent = `Space ${space.number} selected. Now click the space to connect to.`;
          }

          if (status) {
            status.textContent = `🔗 Connecting from Space ${space.number}. Choose the destination space.`;
          }

          renderPath();

          return;
        }

        /*
         * Clicking the same space does
         * nothing.
         */

        if (game.connectStartIndex === index) {
          return;
        }

        const startIndex = game.connectStartIndex;

        /*
         * Reset the starting point
         * before creating the connection.
         */

        game.connectStartIndex = null;

        game.selectedSpaceIndex = null;

        const startSpace = game.path[startIndex];

        const destinationSpace = game.path[index];

        if (!startSpace || !destinationSpace) {
          return;
        }

        /*
         * Prevent duplicate connections.
         */

        const alreadyConnected = startSpace.connections.some(
          (connection) => connection.target === index
        );

        if (alreadyConnected) {
          alert(
            `Space ${startSpace.number} is already connected to Space ${destinationSpace.number}.`
          );

          renderPath();

          return;
        }

        /*
         * Create a normal connection.
         */

        startSpace.connections.push({
          target: index,
          type: 'normal',
        });

        const instruction = document.querySelector('#builder-instruction');

        const status = document.querySelector('#path-status');

        if (instruction) {
          instruction.textContent =
            'Connection created! Click another space to connect again.';
        }

        if (status) {
          status.textContent = `🔗 Space ${startSpace.number} → Space ${destinationSpace.number} connected!`;
        }

        renderPath();
      });
    }

    /* -----------------------------------------------------
         ROUTE MODE
         ----------------------------------------------------- */

    if (game.routeMode) {
      marker.style.pointerEvents = 'auto';

      marker.style.cursor = 'pointer';

      marker.addEventListener('click', (event) => {
        event.stopPropagation();

        /*
              First click selects the
              existing space where the
              route begins.
            */

        if (game.routeStartIndex === null) {
          selectRouteStart(index);

          return;
        }

        /*
              Clicking an existing space
              changes the current route
              endpoint.

              This lets you redirect the
              route if needed.
            */

        game.routeStartIndex = index;

        const instruction = document.querySelector('#builder-instruction');

        const status = document.querySelector('#path-status');

        if (instruction) {
          instruction.textContent = `Route continues from Space ${space.number}. Click the board to add the next space.`;
        }

        if (status) {
          status.textContent = `🌿 Next new space will connect from Space ${space.number}.`;
        }

        renderPath();
      });
    }

    overlay.appendChild(marker);
  });

  const pathCount = document.querySelector('#path-count');

  if (pathCount) {
    pathCount.textContent = `${game.path.length} ${
      game.path.length === 1 ? 'space' : 'spaces'
    }`;
  }
}

/* =========================================================
   SPACE SIZE LABEL
   ========================================================= */

function updateSpaceSizeLabel() {
  const label = document.querySelector('#space-size-label');

  if (!label) {
    return;
  }

  if (game.spaceSize <= 28) {
    label.textContent = 'Small';
  } else if (game.spaceSize >= 44) {
    label.textContent = 'Large';
  } else {
    label.textContent = 'Medium';
  }
}

/* =========================================================
   DRAG PATH SPACE
   ========================================================= */

function startDraggingSpace(event) {
  event.preventDefault();

  const marker = event.currentTarget;

  const spaceIndex = game.path.findIndex(
    (space) => space.number === Number(marker.textContent)
  );

  if (spaceIndex === -1) {
    return;
  }

  game.draggingSpaceIndex = spaceIndex;

  game.selectedSpaceIndex = spaceIndex;

  marker.style.cursor = 'grabbing';

  const board = document.querySelector('#builder-board');

  function moveSpace(moveEvent) {
    const rectangle = board.getBoundingClientRect();

    let x = ((moveEvent.clientX - rectangle.left) / rectangle.width) * 100;

    let y = ((moveEvent.clientY - rectangle.top) / rectangle.height) * 100;

    x = Math.max(0, Math.min(100, x));

    y = Math.max(0, Math.min(100, y));

    game.path[spaceIndex].x = x;

    game.path[spaceIndex].y = y;

    renderPath();
  }

  function stopDragging() {
    game.draggingSpaceIndex = null;

    document.removeEventListener('mousemove', moveSpace);

    document.removeEventListener('mouseup', stopDragging);
  }

  document.addEventListener('mousemove', moveSpace);

  document.addEventListener('mouseup', stopDragging);
}

/* =========================================================
   DELETE SELECTED SPACE
   ========================================================= */

function deleteSelectedSpace() {
  if (game.selectedSpaceIndex === null) {
    return;
  }

  const deletedIndex = game.selectedSpaceIndex;

  game.path.splice(deletedIndex, 1);

  /*
    Remove connections to the
    deleted node and shift all
    later indexes down.
  */

  game.path.forEach((space) => {
    space.connections = space.connections.filter((connection) => {
      if (connection.target === deletedIndex) {
        return false;
      }

      if (connection.target > deletedIndex) {
        connection.target -= 1;
      }

      return true;
    });
  });

  game.path.forEach((space, index) => {
    space.number = index + 1;
  });

  game.selectedSpaceIndex = null;

  game.branchStartIndex = null;

  game.routeStartIndex = null;

  renderPath();

  const status = document.querySelector('#path-status');

  if (status) {
    status.textContent =
      game.path.length === 0
        ? 'Click the starting position.'
        : 'Space deleted. Continue editing the path.';
  }
}

/* =========================================================
   UNDO
   ========================================================= */

function undoPathSpace() {
  if (game.path.length === 0) {
    return;
  }

  const removedIndex = game.path.length - 1;

  game.path.pop();

  game.path.forEach((space) => {
    space.connections = space.connections.filter(
      (connection) => connection.target !== removedIndex
    );
  });

  game.selectedSpaceIndex = null;

  game.branchStartIndex = null;

  game.routeStartIndex = null;

  renderPath();

  const status = document.querySelector('#path-status');

  if (status) {
    status.textContent =
      game.path.length === 0
        ? 'Click the starting position.'
        : 'Space removed. Continue editing the path.';
  }
}

/* =========================================================
   CLEAR PATH
   ========================================================= */

function clearPath() {
  if (game.path.length === 0) {
    return;
  }

  game.path = [];

  game.selectedSpaceIndex = null;

  game.branchStartIndex = null;

  game.routeStartIndex = null;

  game.branchMode = false;

  game.routeMode = false;

  renderPath();

  const status = document.querySelector('#path-status');

  if (status) {
    status.textContent = 'Path cleared. Click the starting position.';
  }
}

/* =========================================================
   SAVE PATH
   ========================================================= */

function savePath() {
  if (game.path.length < 2) {
    alert('Please create at least two spaces.');

    return;
  }

  createRoom();
}

/* =========================================================
   SAVE BOARD
   ========================================================= */

async function saveBoard() {
  if (game.path.length < 2) {
    alert('Please create at least two spaces before saving the board.');
    return;
  }

  const boardName = window.prompt(
    '🏴‍☠️ Name your board:',
    game.editingBoard ? 'Updated Board' : 'My Board'
  );

  if (boardName === null) {
    return;
  }

  const trimmedName = boardName.trim();

  if (!trimmedName) {
    alert('Please enter a board name.');
    return;
  }

  const boardData = {
    board_name: trimmedName,
    board_image: game.boardImage,
    characters: game.characters,
    path: game.path,
    cards: game.customCards,
  };

  let data;
  let error;

  if (game.editingBoard && game.editingBoardId) {
    const result = await supabase
      .from('rooms')
      .update(boardData)
      .eq('id', game.editingBoardId);

    data = result.data;
    error = result.error;
  } else {
    const result = await supabase
      .from('rooms')
      .insert({
        code: `BOARD-${Date.now()}`,
        host_id: crypto.randomUUID(),
        status: 'saved',
        ...boardData,
      })
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('Board save failed:', error);
    alert(`Could not save board: ${error.message}`);
    return;
  }

  console.log('Board saved!', data);

  if (game.editingBoard) {
    alert(`🏴‍☠️ "${trimmedName}" was updated successfully!`);
  } else {
    alert(`🏴‍☠️ "${trimmedName}" was saved successfully!`);
  }
}

/* =========================================================
   CURRENT PLAYER
   ========================================================= */

function createCurrentPlayer() {
  if (
    game.selectedCharacter === null ||
    !game.characters[game.selectedCharacter]
  ) {
    return null;
  }

  return {
    characterIndex: game.selectedCharacter,

    position: 0,
  };
}

/* =========================================================
   TOKEN OFFSETS
   ========================================================= */

function getTokenOffsets(tokenCount) {
  if (tokenCount === 1) {
    return [
      {
        x: 0,
        y: 0,
      },
    ];
  }

  if (tokenCount === 2) {
    return [
      {
        x: -0.35,
        y: 0,
      },
      {
        x: 0.35,
        y: 0,
      },
    ];
  }

  if (tokenCount === 3) {
    return [
      {
        x: 0,
        y: -0.35,
      },
      {
        x: -0.35,
        y: 0.25,
      },
      {
        x: 0.35,
        y: 0.25,
      },
    ];
  }

  if (tokenCount === 4) {
    return [
      {
        x: -0.3,
        y: -0.3,
      },
      {
        x: 0.3,
        y: -0.3,
      },
      {
        x: -0.3,
        y: 0.3,
      },
      {
        x: 0.3,
        y: 0.3,
      },
    ];
  }

  if (tokenCount === 5) {
    return [
      {
        x: 0,
        y: -0.38,
      },
      {
        x: -0.36,
        y: -0.05,
      },
      {
        x: 0.36,
        y: -0.05,
      },
      {
        x: -0.22,
        y: 0.38,
      },
      {
        x: 0.22,
        y: 0.38,
      },
    ];
  }

  return [
    {
      x: -0.32,
      y: -0.38,
    },
    {
      x: 0.32,
      y: -0.38,
    },
    {
      x: -0.38,
      y: 0,
    },
    {
      x: 0.38,
      y: 0,
    },
    {
      x: -0.32,
      y: 0.38,
    },
    {
      x: 0.32,
      y: 0.38,
    },
  ];
}

/* =========================================================
   RENDER TOKENS
   ========================================================= */

function renderTokens(jumpingPlayerIndex = null) {
  const board = document.querySelector('#game-board-image');

  const tokenLayer = document.querySelector('#token-layer');

  if (!board || !tokenLayer) {
    return;
  }

  tokenLayer.innerHTML = '';

  if (game.players.length === 0) {
    return;
  }

  const boardRectangle = board.getBoundingClientRect();

  const layerRectangle = tokenLayer.getBoundingClientRect();

  const tokenSize = game.spaceSize * 0.82;

  game.path.forEach((space, spaceIndex) => {
    const playersHere = game.players.filter(
      (player) => player.position === spaceIndex
    );

    if (playersHere.length === 0) {
      return;
    }

    const offsets = getTokenOffsets(playersHere.length);

    playersHere.forEach((player, playerIndex) => {
      const character = game.characters[player.characterIndex];

      if (!character) {
        return;
      }

      const token = document.createElement('div');

      token.className = 'character-token';

      if (playerIndex === jumpingPlayerIndex) {
        token.classList.add('token-jumping');
      }

      token.style.width = `${tokenSize}px`;

      token.style.height = `${tokenSize}px`;

      const baseX = (space.x / 100) * boardRectangle.width;

      const baseY = (space.y / 100) * boardRectangle.height;

      const offset = offsets[playerIndex];

      const imageOffsetX = boardRectangle.left - layerRectangle.left;

      const imageOffsetY = boardRectangle.top - layerRectangle.top;

      token.style.left = `${baseX + imageOffsetX + offset.x * tokenSize}px`;

      token.style.top = `${baseY + imageOffsetY + offset.y * tokenSize}px`;

      token.innerHTML = `
            <img
              src="${character.image}"
              alt="Character token"
            >
          `;

      tokenLayer.appendChild(token);
    });
  });
}

/* =========================================================
   WAIT
   ========================================================= */

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/* =========================================================
   DICE RESULT FLAG
   ========================================================= */

function showDiceFlag(result) {
  const existingFlag = document.querySelector('#dice-roll-flag');

  if (existingFlag) {
    existingFlag.remove();
  }

  const flag = document.createElement('div');

  flag.id = 'dice-roll-flag';

  flag.innerHTML = `
    <div
      style="
        position: relative;
        background: #ef6b5b;
        color: white;
        padding: 14px 24px;
        border-radius: 14px;
        font-size: 38px;
        font-weight: 900;
        line-height: 1;
        box-shadow:
          0 5px 0 #b9443b,
          0 8px 15px rgba(0,0,0,0.22);
        border: 3px solid #fff;
        transform: rotate(-3deg) scale(0.4);
        opacity: 0;
        transition:
          transform 0.25s ease,
          opacity 0.25s ease;
        white-space: nowrap;
      "
    >
      🏴‍☠️ ${result}!
    </div>
  `;

  flag.style.position = 'fixed';

  flag.style.left = '50%';

  flag.style.top = '38%';

  flag.style.transform = 'translate(-50%, -50%)';

  flag.style.zIndex = '9999';

  flag.style.pointerEvents = 'none';

  document.body.appendChild(flag);

  const flagInner = flag.firstElementChild;

  requestAnimationFrame(() => {
    flagInner.style.transform = 'rotate(-3deg) scale(1)';

    flagInner.style.opacity = '1';
  });

  return flag;
}

/* =========================================================
   HIDE DICE FLAG
   ========================================================= */

async function hideDiceFlag(flag) {
  if (!flag) {
    return;
  }

  const flagInner = flag.firstElementChild;

  if (flagInner) {
    flagInner.style.transform = 'rotate(3deg) scale(0.4)';

    flagInner.style.opacity = '0';
  }

  await sleep(250);

  flag.remove();
}

/* =========================================================
   GET AVAILABLE CONNECTIONS
   ========================================================= */

function getAvailableConnections(position) {
  const space = game.path[position];

  if (!space || !space.connections) {
    return [];
  }

  return space.connections
    .map((connection) => ({
      ...connection,

      destination: game.path[connection.target],
    }))
    .filter((connection) => connection.destination);
}

/* =========================================================
   CHOOSE ROUTE
   ========================================================= */

function chooseRoute(player, connections) {
  if (!player || connections.length === 0) {
    return Promise.resolve(null);
  }

  /*
   * Optional branches do NOT create a
   * route-choice popup.
   *
   * They are handled separately by
   * checkOptionalBranch().
   */

  const choices = connections.filter(
    (connection) => connection.type !== 'optional'
  );

  /*
   * If there is only one normal/choice
   * connection, automatically continue.
   *
   * This is important for Connect Paths:
   * reconnecting to the main path should
   * NEVER ask the player to choose.
   */

  if (choices.length <= 1) {
    return Promise.resolve(choices.length === 1 ? choices[0] : null);
  }

  return new Promise((resolve) => {
    const existingPopup = document.querySelector('#route-choice-popup');

    if (existingPopup) {
      existingPopup.remove();
    }

    const popup = document.createElement('div');

    popup.id = 'route-choice-popup';

    popup.style.position = 'fixed';

    popup.style.inset = '0';

    popup.style.display = 'flex';

    popup.style.alignItems = 'center';

    popup.style.justifyContent = 'center';

    popup.style.background = 'rgba(24, 59, 82, 0.55)';

    popup.style.zIndex = '10000';

    popup.style.padding = '20px';

    const card = document.createElement('div');

    card.style.background = '#fff9e8';

    card.style.border = '5px solid #f6b928';

    card.style.borderRadius = '24px';

    card.style.padding = '28px';

    card.style.width = 'min(500px, 90vw)';

    card.style.boxShadow = '0 10px 0 #c98512, 0 15px 30px rgba(0,0,0,0.25)';

    card.style.textAlign = 'center';

    card.innerHTML = `
        <div
          style="
            font-size: 42px;
            margin-bottom: 8px;
          "
        >
          🏴‍☠️
        </div>
  
        <h2
          style="
            margin: 0 0 8px;
            color: #183b52;
            font-size: 28px;
          "
        >
          Choose Your Route!
        </h2>
  
        <p
          style="
            margin: 0 0 22px;
            color: #70482d;
            font-size: 16px;
            font-weight: 700;
          "
        >
          You have more than one way to go!
        </p>
  
        <div
          id="route-choice-buttons"
          style="
            display: flex;
            flex-direction: column;
            gap: 12px;
          "
        ></div>
  
        <button
          id="route-stay"
          style="
            margin-top: 18px;
            padding: 10px 18px;
            border: 2px solid #70482d;
            border-radius: 12px;
            background: white;
            color: #70482d;
            font-size: 15px;
            font-weight: 800;
            cursor: pointer;
          "
        >
          Stay Here
        </button>
      `;

    popup.appendChild(card);

    document.body.appendChild(popup);

    const buttonContainer = card.querySelector('#route-choice-buttons');

    choices.forEach((connection, index) => {
      const button = document.createElement('button');

      button.style.padding = '14px 18px';

      button.style.border = '3px solid #126b83';

      button.style.borderRadius = '15px';

      button.style.background = '#3bb7d6';

      button.style.color = 'white';

      button.style.fontSize = '17px';

      button.style.fontWeight = '900';

      button.style.cursor = 'pointer';

      const routeName = connection.routeName || `Route ${index + 1}`;

      button.innerHTML = `🗺️ ${escapeHtml(routeName)}`;

      button.addEventListener('click', () => {
        popup.remove();

        resolve(connection);
      });

      buttonContainer.appendChild(button);
    });

    card.querySelector('#route-stay').addEventListener('click', () => {
      popup.remove();

      resolve(null);
    });
  });
}

/* =========================================================
   CHECK OPTIONAL SHORTCUT
   ========================================================= */

function showCardPopup(card) {
  return new Promise((resolve) => {
    const existingPopup = document.querySelector('#draw-card-popup');

    if (existingPopup) {
      existingPopup.remove();
    }

    const popup = document.createElement('div');

    popup.id = 'draw-card-popup';

    popup.style.position = 'fixed';

    popup.style.inset = '0';

    popup.style.display = 'flex';

    popup.style.alignItems = 'center';

    popup.style.justifyContent = 'center';

    popup.style.background = 'rgba(24, 59, 82, 0.55)';

    popup.style.zIndex = '10000';

    popup.style.padding = '20px';

    const cardElement = document.createElement('div');

    cardElement.style.background = '#fff9e8';

    cardElement.style.border = '5px solid #f6b928';

    cardElement.style.borderRadius = '24px';

    cardElement.style.padding = '28px';

    cardElement.style.width = 'min(500px, 90vw)';

    cardElement.style.boxShadow =
      '0 10px 0 #c98512, 0 15px 30px rgba(0,0,0,0.25)';

    cardElement.style.textAlign = 'center';

    cardElement.innerHTML = `
        <div
          style="
            font-size: 48px;
            margin-bottom: 8px;
          "
        >
          🎴
        </div>
  
        <h2
          style="
            margin: 0 0 12px;
            color: #183b52;
            font-size: 30px;
          "
        >
          ${escapeHtml(card.title)}
        </h2>
  
        <p
          style="
            margin: 0 0 25px;
            color: #70482d;
            font-size: 18px;
            font-weight: 700;
            line-height: 1.5;
          "
        >
          ${escapeHtml(card.text)}
        </p>
  
        <button
          id="card-got-it"
          style="
            width: 100%;
            padding: 14px 18px;
            border: 3px solid #126b83;
            border-radius: 15px;
            background: #3bb7d6;
            color: white;
            font-size: 18px;
            font-weight: 900;
            cursor: pointer;
          "
        >
          🏴‍☠️ Got It!
        </button>
      `;

    popup.appendChild(cardElement);

    document.body.appendChild(popup);

    cardElement.querySelector('#card-got-it').addEventListener('click', () => {
      popup.remove();
      resolve();
    });
  });
}

async function checkOptionalBranch(player) {
  const connections = getAvailableConnections(player.position);

  const optional = connections.filter(
    (connection) => connection.type === 'optional'
  );

  if (optional.length === 0) {
    return false;
  }

  /*
   * If there are multiple optional
   * shortcuts, use the first one for now.
   *
   * We can improve multiple-shortcut
   * choices later if needed.
   */

  const selected = optional[0];

  const shortcutName = selected.routeName || 'Shortcut';

  return new Promise((resolve) => {
    const existingPopup = document.querySelector('#shortcut-choice-popup');

    if (existingPopup) {
      existingPopup.remove();
    }

    const popup = document.createElement('div');

    popup.id = 'shortcut-choice-popup';

    popup.style.position = 'fixed';

    popup.style.inset = '0';

    popup.style.display = 'flex';

    popup.style.alignItems = 'center';

    popup.style.justifyContent = 'center';

    popup.style.background = 'rgba(24, 59, 82, 0.55)';

    popup.style.zIndex = '10000';

    popup.style.padding = '20px';

    const card = document.createElement('div');

    card.style.background = '#fff9e8';

    card.style.border = '5px solid #f6b928';

    card.style.borderRadius = '24px';

    card.style.padding = '28px';

    card.style.width = 'min(500px, 90vw)';

    card.style.boxShadow = '0 10px 0 #c98512, 0 15px 30px rgba(0,0,0,0.25)';

    card.style.textAlign = 'center';

    card.innerHTML = `
        <div
          style="
            font-size: 42px;
            margin-bottom: 8px;
          "
        >
          🔀
        </div>
  
        <h2
          style="
            margin: 0 0 8px;
            color: #183b52;
            font-size: 28px;
          "
        >
          Take "${escapeHtml(shortcutName)}"?
        </h2>
  
        <p
          style="
            margin: 0 0 22px;
            color: #70482d;
            font-size: 16px;
            font-weight: 700;
          "
        >
          You found a shortcut!
        </p>
  
        <div
          style="
            display: flex;
            gap: 12px;
            justify-content: center;
          "
        >
  
          <button
            id="shortcut-yes"
            style="
              flex: 1;
              padding: 14px 18px;
              border: 3px solid #126b83;
              border-radius: 15px;
              background: #3bb7d6;
              color: white;
              font-size: 17px;
              font-weight: 900;
              cursor: pointer;
            "
          >
            🏴‍☠️ Yes!
          </button>
  
          <button
            id="shortcut-no"
            style="
              flex: 1;
              padding: 14px 18px;
              border: 3px solid #70482d;
              border-radius: 15px;
              background: white;
              color: #70482d;
              font-size: 17px;
              font-weight: 900;
              cursor: pointer;
            "
          >
            ❌ No
          </button>
  
        </div>
      `;

    popup.appendChild(card);

    document.body.appendChild(popup);

    card.querySelector('#shortcut-yes').addEventListener('click', async () => {
      popup.remove();

      player.position = selected.target;

      renderTokens();

      await sleep(420);

      resolve(true);
    });

    card.querySelector('#shortcut-no').addEventListener('click', () => {
      popup.remove();

      resolve(false);
    });
  });
}

/* =========================================================
   MOVE PLAYER
   ========================================================= */

async function movePlayer(playerIndex, spacesToMove) {
  const player = game.players[playerIndex];

  if (!player) {
    return;
  }

  const visited = new Set();

  for (let step = 0; step < spacesToMove; step++) {
    if (player.position >= game.path.length) {
      break;
    }

    if (visited.has(player.position)) {
      console.warn('Movement stopped because a loop was detected.');

      break;
    }

    visited.add(player.position);

    const currentSpace = game.path[player.position];

    if (!currentSpace) {
      break;
    }

    const connections = getAvailableConnections(player.position);

    if (connections.length === 0) {
      break;
    }

    const choiceConnections = connections.filter(
      (connection) => connection.type === 'choice'
    );

    let nextConnection;

    if (choiceConnections.length > 0) {
      nextConnection = await chooseRoute(player, connections);

      if (!nextConnection) {
        break;
      }
    } else {
      const normalConnections = connections.filter(
        (connection) =>
          connection.type === 'normal' || connection.type === 'choice'
      );

      if (normalConnections.length === 0) {
        break;
      }

      if (normalConnections.length === 1) {
        nextConnection = normalConnections[0];
      } else {
        nextConnection = await chooseRoute(player, normalConnections);

        if (!nextConnection) {
          break;
        }
      }
    }

    player.position = nextConnection.target;

    renderTokens(playerIndex);

    await sleep(420);
  }

  /*
      Optional shortcuts are checked
      after dice movement finishes.
    */

  if (player.position < game.path.length - 1) {
    await checkOptionalBranch(player);
  }

  if (
    player.position < game.path.length - 1 &&
    game.path[player.position].drawCard
  ) {
    const card = drawRandomCard();

    if (card) {
      await showCardPopup(card);

      await applyCardEffect(card, player);
    }
  }

  renderTokens();

  const turnMessage = document.querySelector('#turn-message');

  if (player.position === game.path.length - 1) {
    if (turnMessage) {
      turnMessage.textContent = '🏆 You reached the end!';
    }
  }
}

/* =========================================================
   ROLL DICE
   ========================================================= */

async function rollDice() {
  if (game.isRolling) {
    return;
  }

  const currentPlayer = game.players[0];

  if (currentPlayer && currentPlayer.skipNextTurn) {
    currentPlayer.skipNextTurn = false;

    const turnMessage = document.querySelector('#turn-message');

    if (turnMessage) {
      turnMessage.textContent = '🍹 You have to sit this turn out!';
    }

    return;
  }

  if (game.players.length === 0) {
    alert('Please select a character before playing.');

    return;
  }

  if (game.path.length < 2) {
    alert('The board needs at least two spaces before you can roll.');

    return;
  }

  const rollButton = document.querySelector('#roll-dice');

  const diceResult = document.querySelector('#dice-result');

  if (!rollButton) {
    return;
  }

  game.isRolling = true;

  rollButton.disabled = true;

  const turnMessage = document.querySelector('#turn-message');

  if (turnMessage) {
    turnMessage.textContent = '🏴‍☠️ Your Turn!';
  }

  if (diceResult) {
    diceResult.textContent = 'Rolling...';
  }

  const result = Math.floor(Math.random() * 4) + 1;

  game.diceValue = result;

  console.log('D4 result:', result);

  const flag = showDiceFlag(result);

  if (diceResult) {
    diceResult.textContent = `You rolled ${result}!`;
  }

  await sleep(750);

  await hideDiceFlag(flag);

  await movePlayer(0, result);

  const player = game.players[0];

  if (player && player.rollAgain) {
    player.rollAgain = false;

    const turnMessage = document.querySelector('#turn-message');

    if (turnMessage) {
      turnMessage.textContent = '🎲 Lucky Pirate! Roll again!';
    }

    rollButton.disabled = false;
    game.isRolling = false;

    return;
  }

  rollButton.disabled = false;

  game.isRolling = false;
}

/* =========================================================
   GAME BOARD
   ========================================================= */
async function applyCardEffect(card, player) {
  if (!card || !player) {
    return;
  }

  const amount = Number(card.amount) || 0;

  switch (card.effect) {
    case 'move': {
      const direction = amount >= 0 ? 1 : -1;
      const steps = Math.abs(amount);
      const playerIndex = game.players.indexOf(player);

      for (let i = 0; i < steps; i++) {
        const nextPosition = player.position + direction;

        player.position = Math.max(
          0,
          Math.min(nextPosition, game.path.length - 1)
        );

        renderTokens(playerIndex);

        await sleep(420);

        if (player.position === 0 || player.position === game.path.length - 1) {
          break;
        }
      }

      break;
    }

    case 'skip':
      player.skipNextTurn = true;

      break;

    case 'reroll':
      player.rollAgain = true;

      break;

    case 'none':
    default:
      break;
  }
}

function drawRandomCard() {
  if (game.cardDeck.length === 0) {
    if (game.discardedCards.length === 0) {
      return null;
    }

    game.cardDeck = [...game.discardedCards];

    game.discardedCards = [];

    for (let i = game.cardDeck.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));

      [game.cardDeck[i], game.cardDeck[randomIndex]] = [
        game.cardDeck[randomIndex],
        game.cardDeck[i],
      ];
    }
  }

  const randomIndex = Math.floor(Math.random() * game.cardDeck.length);

  const card = game.cardDeck.splice(randomIndex, 1)[0];

  game.discardedCards.push(card);

  return card;
}

function showGameBoard() {
  game.cardDeck = [...game.customCards];
  game.discardedCards = [];
  const currentPlayer = createCurrentPlayer();

  game.players = [];

  if (currentPlayer) {
    game.players.push(currentPlayer);
  }

  app.innerHTML = `
      <div class="game-screen">
  
        <div class="game-header">
  
          <strong>
            🎲 Game Night
          </strong>
  
          <div class="room-code-display">
            ROOM CODE:
            <strong>
              ${game.roomCode || '-----'}
            </strong>
          </div>
  
          <span>
            ${game.path.length} spaces
          </span>
  
        </div>
  
        <div class="game-board-area">
  
          <div class="game-board">
  
            <img
              id="game-board-image"
              src="${game.boardImage}"
              alt="Game board"
            >
  
            <div
              id="token-layer"
              class="token-layer"
            ></div>
  
          </div>
  
        </div>
  
        <div class="game-controls">
  
          <div
            class="turn-message"
            id="turn-message"
          >
            🏴‍☠️ Your Turn!
          </div>
  
          <div class="dice-area">
  
            <div
              id="dice-result"
              class="dice-result-text"
            >
              Ready to roll!
            </div>
  
          </div>
  
          <button
            id="roll-dice"
            class="roll-button"
          >
            🎲 Roll Dice
          </button>
  
          <button
            id="play-again"
            class="roll-button"
          >
            🔄 Play Again
          </button>
  
        </div>
  
      </div>
    `;

  const board = document.querySelector('#game-board-image');

  board.addEventListener('load', () => {
    renderTokens();
  });

  renderTokens();

  document.querySelector('#roll-dice').addEventListener('click', rollDice);

  document.querySelector('#play-again').addEventListener('click', () => {
    game.players.forEach((player) => {
      player.position = 0;
    });

    game.diceValue = 1;
    game.isRolling = false;

    game.cardDeck = [...game.customCards];
    game.discardedCards = [];

    const diceResult = document.querySelector('#dice-result');

    if (diceResult) {
      diceResult.textContent = 'Ready to roll!';
    }

    const turnMessage = document.querySelector('#turn-message');

    if (turnMessage) {
      turnMessage.textContent = '🏴‍☠️ Your Turn!';
    }

    renderTokens();
  });

  window.addEventListener('resize', renderTokens);
}

/* =========================================================
   START APP
   ========================================================= */

showHome();
