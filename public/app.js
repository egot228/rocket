const state = {
  userId: 'demo-user',
  crashPoint: null,
  multiplier: 1,
  running: false,
  stake: 0,
  currency: 'ton',
  ticker: null
};

const $ = (id) => document.getElementById(id);
const refs = {
  userId: $('userId'),
  tonBalance: $('tonBalance'),
  starsBalance: $('starsBalance'),
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

const updateRocketPosition = (progress) => {
  const x = 8 + progress * 76;
  const y = 10 + progress * 64;
  const tilt = -28 + progress * 12;
  refs.rocket.style.transform = `translate(${x}%, -${y}%) rotate(${tilt}deg)`;
};

const resetRocket = () => {
  refs.rocketStage.classList.remove('crashed');
  refs.rocket.style.transform = 'translate(0, 0) rotate(0deg)';
  updateRocketPosition(0);
};

const stopRound = (reason, crashed = false) => {
  state.running = false;
  clearInterval(state.ticker);
  refs.startRound.disabled = false;
  refs.cashout.disabled = true;
  refs.status.textContent = reason;
  if (crashed) refs.rocketStage.classList.add('crashed');
};

const runAnimation = () => {
  const started = Date.now();
  const duration = 18000;

  state.ticker = setInterval(async () => {
    const elapsed = (Date.now() - started) / 1000;
    const curve = elapsed * 0.26 + elapsed ** 1.45 * 0.04;
    state.multiplier = Number((1 + curve).toFixed(2));
    refs.multiplier.textContent = `${state.multiplier.toFixed(2)}x`;

    const progress = Math.min(1, (Date.now() - started) / duration);
    updateRocketPosition(progress);

    if (state.multiplier >= state.crashPoint) {
      stopRound(`💥 Краш на ${state.crashPoint}x. Ставка сгорела.`, true);
      await refreshUser();
    }
  }, 80);
};

refs.loadUser.addEventListener('click', async () => {
  state.userId = refs.userId.value.trim() || 'demo-user';
  await refreshUser();
  toast('Профиль обновлён');
});

refs.startRound.addEventListener('click', async () => {
  try {
    const stake = Number(refs.stake.value);
    const currency = refs.currency.value;

    const data = await api('/api/game/start', {
      method: 'POST',
      body: JSON.stringify({ userId: state.userId, stake, currency })
    });

    state.running = true;
    state.stake = stake;
    state.currency = currency;
    state.crashPoint = data.crashPoint;
    state.multiplier = 1;

    refs.startRound.disabled = true;
    refs.cashout.disabled = false;
    refs.status.textContent = 'Ракета плавно набирает высоту...';
    resetRocket();
    runAnimation();
    await refreshUser();
  } catch (e) {
    toast(e.message);
  }
});

refs.cashout.addEventListener('click', async () => {
  if (!state.running) return;
  try {
    const data = await api('/api/game/cashout', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        currency: state.currency,
        stake: state.stake,
        multiplier: state.multiplier,
        crashPoint: state.crashPoint
      })
    });
    stopRound(`✅ Успех! Выигрыш ${data.win} ${state.currency.toUpperCase()}`);
    await refreshUser();
  } catch (e) {
    stopRound(`💥 ${e.message}`, true);
    await refreshUser();
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

resetRocket();
refreshUser().catch((e) => toast(e.message));
