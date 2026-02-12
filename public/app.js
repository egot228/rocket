const state = {
  userId: 'demo-user',
  roundId: null,
  phase: 'betting',
  multiplier: 1,
  activeBet: null,
  syncTimer: null
};

const $ = (id) => document.getElementById(id);
const refs = {
  userId: $('userId'),
  tonBalance: $('tonBalance'),
  starsBalance: $('starsBalance'),
  roundId: $('roundId'),
  loadUser: $('loadUser'),
  status: $('status'),
  multiplier: $('multiplier'),
  rocketStage: $('rocketStage'),
  rocket: $('rocket'),
  currency: $('currency'),
  stake: $('stake'),
  startRound: $('startRound'),
  cashout: $('cashout'),
  topupTon: $('topupTon'),
  topupStars: $('topupStars'),
  adminKey: $('adminKey'),
  grantTon: $('grantTon'),
  grantStars: $('grantStars'),
  grantBtn: $('grantBtn'),
  toast: $('toast')
};

const toast = (msg) => {
  refs.toast.textContent = msg;
  refs.toast.classList.add('show');
  setTimeout(() => refs.toast.classList.remove('show'), 2100);
};

const api = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
};

const refreshUser = async () => {
  const user = await api(`/api/users/${state.userId}`);
  refs.tonBalance.textContent = user.ton.toFixed(2);
  refs.starsBalance.textContent = user.stars.toFixed(0);
};

const updateRocketPosition = (multiplier) => {
  const normalized = Math.min(1, Math.log(multiplier) / Math.log(8));
  const x = normalized * 74;
  const y = normalized * 66;
  const angle = -4 - normalized * 26;
  refs.rocket.style.transform = `translate(${x}%, -${y}%) rotate(${angle}deg)`;
};

const setCashoutButton = () => {
  if (!state.activeBet || state.phase !== 'running') {
    refs.cashout.textContent = 'Забрать';
    refs.cashout.disabled = true;
    return;
  }

  const amount = (state.activeBet.stake * state.multiplier).toFixed(2);
  refs.cashout.textContent = `Забрать ${amount} ${state.activeBet.currency.toUpperCase()}`;
  refs.cashout.disabled = false;
};

const updatePhaseUi = (round) => {
  state.phase = round.phase;
  state.multiplier = round.multiplier;
  refs.roundId.textContent = round.id;
  refs.multiplier.textContent = `${round.multiplier.toFixed(2)}x`;
  updateRocketPosition(round.multiplier);

  if (round.phase === 'betting') {
    refs.rocketStage.classList.remove('crashed');
    refs.status.textContent = `Ставки открыты • старт через ${round.secondsToStart.toFixed(1)}с`;
    refs.startRound.disabled = false;
    refs.startRound.textContent = state.activeBet ? 'Ставка принята' : 'Сделать ставку';
  } else if (round.phase === 'running') {
    refs.status.textContent = 'Ракета летит: сначала медленно, потом ускоряется';
    refs.startRound.disabled = true;
    refs.startRound.textContent = 'Раунд в процессе';
  } else {
    refs.rocketStage.classList.add('crashed');
    refs.status.textContent = `💥 Краш на ${round.crashPoint.toFixed(2)}x • новый раунд через ${round.secondsToNext.toFixed(1)}с`;
    refs.startRound.disabled = true;
    refs.startRound.textContent = 'Ожидание раунда';
  }

  setCashoutButton();
};

const syncRound = async () => {
  const round = await api('/api/game/round');
  state.roundId = round.id;

  const bet = await api(`/api/game/bet/${state.userId}`);
  state.activeBet = bet.active ? bet : null;

  if (state.activeBet && state.activeBet.roundId !== round.id) {
    state.activeBet = null;
  }

  updatePhaseUi(round);
};

refs.loadUser.addEventListener('click', async () => {
  state.userId = refs.userId.value.trim() || 'demo-user';
  await refreshUser();
  await syncRound();
  toast('Профиль обновлён');
});

refs.startRound.addEventListener('click', async () => {
  try {
    if (state.phase !== 'betting') {
      toast('Ставки в этом раунде уже закрыты');
      return;
    }
    if (state.activeBet) {
      toast('Вы уже участвуете в текущем раунде');
      return;
    }

    await api('/api/game/bet', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        stake: Number(refs.stake.value),
        currency: refs.currency.value,
        roundId: state.roundId
      })
    });

    await refreshUser();
    await syncRound();
    toast('Ставка принята в общий раунд');
  } catch (e) {
    toast(e.message);
  }
});

refs.cashout.addEventListener('click', async () => {
  if (!state.activeBet || state.phase !== 'running') return;

  try {
    const data = await api('/api/game/cashout', {
      method: 'POST',
      body: JSON.stringify({ userId: state.userId, roundId: state.roundId })
    });

    state.activeBet = null;
    setCashoutButton();
    await refreshUser();
    await syncRound();
    toast(`✅ Забрано: ${data.win} ${data.currency.toUpperCase()} на ${data.multiplier.toFixed(2)}x`);
  } catch (e) {
    toast(e.message);
    await syncRound();
  }
});

document.querySelectorAll('[data-topup]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const currency = btn.dataset.topup;
    const amount = Number(currency === 'ton' ? refs.topupTon.value : refs.topupStars.value);
    try {
      await api('/api/topup', {
        method: 'POST',
        body: JSON.stringify({ userId: state.userId, currency, amount })
      });
      await refreshUser();
      toast(`Баланс ${currency.toUpperCase()} пополнен`);
    } catch (e) {
      toast(e.message);
    }
  });
});

refs.grantBtn.addEventListener('click', async () => {
  try {
    await api('/api/admin/grant', {
      method: 'POST',
      body: JSON.stringify({
        adminKey: refs.adminKey.value,
        userId: state.userId,
        ton: Number(refs.grantTon.value),
        stars: Number(refs.grantStars.value)
      })
    });
    await refreshUser();
    toast('Админ-выдача выполнена');
  } catch (e) {
    toast(e.message);
  }
});

const boot = async () => {
  await refreshUser();
  await syncRound();
  state.syncTimer = setInterval(() => {
    syncRound().catch((e) => toast(e.message));
  }, 220);
};

boot().catch((e) => toast(e.message));
