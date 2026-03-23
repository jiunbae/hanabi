import { create } from 'zustand';

export type Locale = 'en' | 'ko';

const translations = {
  en: {
    // Lobby
    'app.title': 'Hanabi',
    'lobby.yourName': 'Your Name',
    'lobby.required': '*',
    'lobby.enterName': 'Enter your name',
    'lobby.players': 'Players',
    'lobby.nPlayers': '{n} Players',
    'lobby.createGame': 'Create Game',
    'lobby.gameId': 'Game ID',
    'lobby.join': 'Join',
    'lobby.openGames': 'Open Games',
    'lobby.playersCount': '{current}/{max} players',
    'lobby.nameRequired': 'Please enter your name first',
    'lobby.tutorial': 'How to Play',
    'lobby.or': 'or',
    'lobby.joinById': 'Join a game by ID',
    'lobby.gamesActive': '{n} games active now',

    // Hero
    'hero.tagline': 'The cooperative card game where you play blind',
    'hero.createGame': 'Start Playing',

    // Features
    'feature.coop.title': 'Cooperative',
    'feature.coop.desc': 'Work together — you win or lose as a team',
    'feature.hidden.title': 'Hidden Information',
    'feature.hidden.desc': 'You can see everyone\'s cards except your own',
    'feature.players.title': '2-5 Players',
    'feature.players.desc': 'Quick rounds, perfect for friends online',

    // Footer
    'footer.builtFor': 'Built for fun with friends',

    // Waiting Room
    'waiting.title': 'Waiting Room',
    'waiting.gameId': 'Game ID',
    'waiting.shareId': 'Share this ID with other players so they can join.',
    'waiting.startGame': 'Start Game',
    'waiting.waitingForHost': 'Waiting for the host to start the game',
    'waiting.waitingForPlayers': 'Waiting for players...',
    'waiting.players': 'Players',
    'waiting.emptySlot': 'Waiting...',
    'waiting.host': 'Host',

    // Game
    'game.waitingToStart': 'Waiting for game to start...',
    'game.yourTurn': 'Your turn!',
    'game.clues': 'Clues',
    'game.strikes': 'Strikes',
    'game.deck': 'Deck',
    'game.turnsLeft': 'Turns left',
    'game.score': 'Score',
    'game.fireworks': 'Fireworks',
    'game.you': 'You',
    'game.player': 'Player {n}',
    'game.turn': '(turn)',
    'game.play': 'Play',
    'game.discard': 'Discard',
    'game.playCard': 'Play Card {n}',
    'game.discardCard': 'Discard Card {n}',
    'game.giveHintTo': 'Give hint to:',
    'game.gameOver': 'Game Over!',
    'game.finalScore': 'Final Score: {score}/25',
    'game.perfect': 'Perfect!',
    'game.great': 'Excellent!',
    'game.good': 'Good!',
    'game.tryAgain': 'Better luck next time!',
    'game.backToLobby': 'Back to Lobby',
    'game.actionLog': 'Action Log',

    // Discard pile
    'discard.title': 'Discard pile',
    'discard.empty': 'Discard pile: empty',
    'discard.count': 'Discard pile ({n})',

    // Action log
    'action.played': '{player} played card {n}',
    'action.discarded': '{player} discarded card {n}',
    'action.hinted': '{player} told {target} about {value}',
    'action.last': 'Last',
    'action.turnN': 'Turn {n}',

    // Connection
    'connection.lost': 'Connection lost. Reconnecting...',
    'error.dismiss': '(click to dismiss)',

    // Tutorial
    'tutorial.title': 'How to Play Hanabi',
    'tutorial.back': 'Back',
    'tutorial.intro': 'Hanabi is a cooperative card game where you can see everyone\'s cards except your own!',
    'tutorial.goal.title': 'Goal',
    'tutorial.goal.text': 'Work together to build 5 firework stacks (one per color), each from 1 to 5, scoring up to 25 points.',
    'tutorial.cards.title': 'Cards',
    'tutorial.cards.text': 'There are 5 colors with ranks 1-5. Each color has: three 1s, two 2s, two 3s, two 4s, and one 5.',
    'tutorial.actions.title': 'On Your Turn',
    'tutorial.action.play': 'Play a card — place it on the matching firework stack. Wrong card = strike!',
    'tutorial.action.discard': 'Discard a card — gain 1 clue token. Cannot discard when clues are at 8.',
    'tutorial.action.hint': 'Give a hint — tell another player about a color or rank in their hand. Costs 1 clue token.',
    'tutorial.endgame.title': 'Game End',
    'tutorial.endgame.text': 'The game ends when: 3 strikes (score 0), all stacks completed (score 25), or the deck runs out (each player gets 1 more turn).',
    'tutorial.tips.title': 'Tips',
    'tutorial.tip1': 'The discard pile is public — track which cards are still available.',
    'tutorial.tip2': 'Completing a color stack (playing a 5) earns a bonus clue token.',
    'tutorial.tip3': 'Fives are unique — never discard them!',
  },
  ko: {
    // 로비
    'app.title': '하나비',
    'lobby.yourName': '이름',
    'lobby.required': '*',
    'lobby.enterName': '이름을 입력하세요',
    'lobby.players': '인원',
    'lobby.nPlayers': '{n}명',
    'lobby.createGame': '게임 만들기',
    'lobby.gameId': '게임 ID',
    'lobby.join': '참가',
    'lobby.openGames': '대기 중인 게임',
    'lobby.playersCount': '{current}/{max}명',
    'lobby.nameRequired': '이름을 먼저 입력해주세요',
    'lobby.tutorial': '게임 방법',
    'lobby.or': '또는',
    'lobby.joinById': '게임 ID로 참가하기',
    'lobby.gamesActive': '현재 {n}개 게임 진행 중',

    // 히어로
    'hero.tagline': '보이지 않는 카드로 함께 플레이하는 협동 게임',
    'hero.createGame': '게임 시작하기',

    // 특징
    'feature.coop.title': '협동 게임',
    'feature.coop.desc': '함께 이기고, 함께 지는 팀 게임',
    'feature.hidden.title': '숨겨진 정보',
    'feature.hidden.desc': '내 카드만 볼 수 없는 독특한 규칙',
    'feature.players.title': '2-5인',
    'feature.players.desc': '빠른 라운드, 친구와 온라인으로',

    // 푸터
    'footer.builtFor': '친구와 함께 즐기기 위해 만들어졌습니다',

    // 대기실
    'waiting.title': '대기실',
    'waiting.gameId': '게임 ID',
    'waiting.shareId': '다른 플레이어에게 이 ID를 공유하세요.',
    'waiting.startGame': '게임 시작',
    'waiting.waitingForHost': '방장이 게임을 시작하길 기다리는 중',
    'waiting.waitingForPlayers': '플레이어 대기 중...',
    'waiting.players': '참가자',
    'waiting.emptySlot': '대기 중...',
    'waiting.host': '방장',

    // 게임
    'game.waitingToStart': '게임 시작을 기다리는 중...',
    'game.yourTurn': '당신의 차례!',
    'game.clues': '단서',
    'game.strikes': '실패',
    'game.deck': '덱',
    'game.turnsLeft': '남은 턴',
    'game.score': '점수',
    'game.fireworks': '불꽃놀이',
    'game.you': '나',
    'game.player': '플레이어 {n}',
    'game.turn': '(차례)',
    'game.play': '내기',
    'game.discard': '버리기',
    'game.playCard': '카드 {n} 내기',
    'game.discardCard': '카드 {n} 버리기',
    'game.giveHintTo': '힌트 주기:',
    'game.gameOver': '게임 종료!',
    'game.finalScore': '최종 점수: {score}/25',
    'game.perfect': '완벽!',
    'game.great': '훌륭해요!',
    'game.good': '잘했어요!',
    'game.tryAgain': '다음에 더 잘할 수 있어요!',
    'game.backToLobby': '로비로 돌아가기',
    'game.actionLog': '행동 기록',

    // 버린 카드
    'discard.title': '버린 카드',
    'discard.empty': '버린 카드: 없음',
    'discard.count': '버린 카드 ({n}장)',

    // 행동 기록
    'action.played': '{player}이(가) 카드 {n}을 냈습니다',
    'action.discarded': '{player}이(가) 카드 {n}을 버렸습니다',
    'action.hinted': '{player}이(가) {target}에게 {value} 힌트를 줬습니다',
    'action.last': '최근',
    'action.turnN': '턴 {n}',

    // 연결
    'connection.lost': '연결이 끊겼습니다. 재연결 중...',
    'error.dismiss': '(클릭하여 닫기)',

    // 튜토리얼
    'tutorial.title': '하나비 게임 방법',
    'tutorial.back': '돌아가기',
    'tutorial.intro': '하나비는 자신의 카드만 볼 수 없는 협동 카드 게임입니다!',
    'tutorial.goal.title': '목표',
    'tutorial.goal.text': '5가지 색상의 불꽃놀이 탑을 1부터 5까지 쌓아 최대 25점을 달성하세요.',
    'tutorial.cards.title': '카드 구성',
    'tutorial.cards.text': '5가지 색상, 각 1~5 숫자. 색상별: 1이 3장, 2~4가 2장씩, 5가 1장. 총 50장.',
    'tutorial.actions.title': '할 수 있는 행동',
    'tutorial.action.play': '카드 내기 — 불꽃놀이 탑에 올립니다. 틀리면 실패!',
    'tutorial.action.discard': '카드 버리기 — 단서 토큰 1개 획득. 단서가 8개일 때는 불가.',
    'tutorial.action.hint': '힌트 주기 — 다른 플레이어에게 색상이나 숫자를 알려줍니다. 단서 1개 소모.',
    'tutorial.endgame.title': '게임 종료 조건',
    'tutorial.endgame.text': '실패 3회 (0점), 모든 탑 완성 (25점), 또는 덱 소진 후 각 플레이어 1턴씩.',
    'tutorial.tips.title': '팁',
    'tutorial.tip1': '버린 카드 더미는 공개 — 어떤 카드가 남았는지 추적하세요.',
    'tutorial.tip2': '5를 올리면 (색상 완성) 보너스 단서 토큰을 받습니다.',
    'tutorial.tip3': '5는 색상별 1장뿐 — 절대 버리지 마세요!',
  },
} as const;

type TranslationKey = keyof typeof translations.en;

interface I18nStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useI18nStore = create<I18nStore>((set) => ({
  locale: (typeof navigator !== 'undefined' && navigator.language.startsWith('ko')) ? 'ko' : 'en',
  setLocale: (locale) => set({ locale }),
}));

export function useT() {
  const { locale } = useI18nStore();
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    let text: string = translations[locale][key] ?? translations.en[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
