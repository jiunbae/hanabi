import { create } from 'zustand';

export type Locale = 'en' | 'ko';

const translations = {
  en: {
    // Lobby
    'app.title': 'Nolbul',
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
    'hero.tagline': 'An AI cooperation research platform',
    'hero.subtitle': 'Test how well AI agents cooperate in a hidden-information card game',
    'hero.createGame': 'Start Playing',

    // Features
    'feature.coop.title': 'AI Cooperation',
    'feature.coop.desc': 'Team up with AI agents — benchmark human-AI teamwork',
    'feature.hidden.title': 'Hidden Information',
    'feature.hidden.desc': 'You can see everyone\'s cards except your own — a classic AI challenge',
    'feature.players.title': '2-5 Players',
    'feature.players.desc': 'Humans, AIs, or both — test different team compositions',

    // Footer
    'footer.builtFor': 'Built for AI cooperation research',
    'footer.disclaimer': 'Inspired by Hanabi, the brilliant cooperative card game by Antoine Bauza.',
    'footer.buyOriginal': 'Love this type of game? Buy the original!',

    // Waiting Room
    'waiting.title': 'Waiting Room',
    'waiting.gameId': 'Game ID',
    'waiting.shareId': 'Share this ID with other players so they can join.',
    'waiting.startGame': 'Start Game',
    'waiting.waitingForHost': 'Waiting for the host to start the game',
    'waiting.waitingForPlayers': 'Waiting for players...',
    'waiting.ready': 'Ready',
    'game.deckEmpty': 'Empty',
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
    'tutorial.title': 'How to Play Nolbul',
    'tutorial.back': 'Back',
    'tutorial.intro': 'Nolbul is a cooperative card game where you can see everyone\'s cards except your own!',
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

    // Leaderboard
    'leaderboard.title': 'Top Scores',
    'game.nameYourGame': 'Name this game',
    'game.saveRecord': 'Save',
    'game.recordSaved': 'Record saved!',

    // AI
    'waiting.addAI': 'Add AI Player',
    'waiting.aiPlayer': 'AI',
    'game.aiIndicator': 'AI',

    // Admin
    'admin.title': 'Admin Panel',
    'admin.login': 'Admin Login',
    'admin.password': 'Admin Key',
    'admin.enter': 'Enter',
    'admin.back': 'Back to Lobby',
    'admin.games': 'Games',
    'admin.stats': 'Statistics',
    'admin.aiConfig': 'AI Configuration',
    'admin.provider': 'Provider',
    'admin.model': 'Model',
    'admin.save': 'Save',
    'admin.configured': 'Configured',
    'admin.notConfigured': 'Not Configured',
    'admin.totalGames': 'Total Games',
    'admin.activeGames': 'Active Games',
    'admin.avgScore': 'Avg Score',
    'admin.aiGames': 'AI Games',
    'footer.admin': 'Admin',
  },
  ko: {
    // 로비
    'app.title': '놀불',
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
    'hero.tagline': 'AI 협동 연구 플랫폼',
    'hero.subtitle': '숨겨진 정보 카드 게임에서 AI 에이전트의 협동 능력을 시험하세요',
    'hero.createGame': '게임 시작하기',

    // 특징
    'feature.coop.title': 'AI 협동',
    'feature.coop.desc': 'AI 에이전트와 팀을 이뤄 인간-AI 협동력을 벤치마크',
    'feature.hidden.title': '숨겨진 정보',
    'feature.hidden.desc': '내 카드만 볼 수 없는 규칙 — AI 연구의 핵심 과제',
    'feature.players.title': '2-5인',
    'feature.players.desc': '사람, AI, 또는 함께 — 다양한 팀 구성 테스트',

    // 푸터
    'footer.builtFor': 'AI 협동 연구를 위해 만들어졌습니다',
    'footer.disclaimer': 'Antoine Bauza의 협동 카드 게임 Hanabi에서 영감을 받았습니다.',
    'footer.buyOriginal': '이런 게임이 마음에 드셨다면, 원작을 구매해보세요!',

    // 대기실
    'waiting.title': '대기실',
    'waiting.gameId': '게임 ID',
    'waiting.shareId': '다른 플레이어에게 이 ID를 공유하세요.',
    'waiting.startGame': '게임 시작',
    'waiting.waitingForHost': '방장이 게임을 시작하길 기다리는 중',
    'waiting.waitingForPlayers': '플레이어 대기 중...',
    'waiting.ready': '준비 완료',
    'game.deckEmpty': '없음',
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
    'tutorial.title': '놀불 게임 방법',
    'tutorial.back': '돌아가기',
    'tutorial.intro': '놀불은 자신의 카드만 볼 수 없는 협동 카드 게임입니다!',
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

    // 리더보드
    'leaderboard.title': '최고 점수',
    'game.nameYourGame': '게임 이름 입력',
    'game.saveRecord': '저장',
    'game.recordSaved': '기록이 저장되었습니다!',

    // AI
    'waiting.addAI': 'AI 플레이어 추가',
    'waiting.aiPlayer': 'AI',
    'game.aiIndicator': 'AI',

    // 관리자
    'admin.title': '관리자 패널',
    'admin.login': '관리자 로그인',
    'admin.password': '관리자 키',
    'admin.enter': '입장',
    'admin.back': '로비로 돌아가기',
    'admin.games': '게임 목록',
    'admin.stats': '통계',
    'admin.aiConfig': 'AI 설정',
    'admin.provider': '제공자',
    'admin.model': '모델',
    'admin.save': '저장',
    'admin.configured': '설정됨',
    'admin.notConfigured': '미설정',
    'admin.totalGames': '전체 게임',
    'admin.activeGames': '진행 중',
    'admin.avgScore': '평균 점수',
    'admin.aiGames': 'AI 게임',
    'footer.admin': '관리자',
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
