'use strict';

/**
 * Математические модели для прогнозирования порчи продуктов питания.
 *
 * Реализованные модели:
 * 1. Baranyi & Roberts (1994) — кинетика роста микроорганизмов
 * 2. Wood Logistic Growth — логистический рост
 * 3. Закон диффузии Фика (2-й) — динамика влаги
 * 4. Модель квадратного корня (Ratkowsky) — зависимость μmax от температуры
 * 5. Комплексный прогноз срока годности
 */

const SECONDS_PER_HOUR = 3600;

// ─── 1. Модель квадратного корня Ратковски ────────────────────────────────────
/**
 * Вычисляет μmax (максимальную удельную скорость роста, ч⁻¹)
 * в зависимости от температуры хранения.
 *
 * Модель: sqrt(μmax) = b * (T - Tmin)
 * Следовательно: μmax = [b * (T - Tmin)]²
 *
 * Параметры для мезофилов (Listeria, Salmonella, E.coli):
 *   Tmin = -1.5 °C, b = 0.0317 (°C⁻¹ ч⁻⁰·⁵)
 * Параметры для психрофилов (LAB, Pseudomonas):
 *   Tmin = -5.0 °C, b = 0.0225
 */
function ratkowskyMuMax(temperature, Tmin = -1.5, b = 0.0317) {
  const T = parseFloat(temperature);
  if (T <= Tmin) return 0; // ниже минимальной температуры роста
  const muMax = Math.pow(b * (T - Tmin), 2);
  return muMax;
}

// ─── 2. Модель Баранья (Baranyi & Roberts, 1994) ──────────────────────────────
/**
 * Полная модель Баранья описывает 4 фазы роста:
 *   - Лаг-фаза (адаптация)
 *   - Экспоненциальный рост
 *   - Замедление роста
 *   - Стационарная фаза
 *
 * Уравнение:
 *   q(t) = q0 * exp(μmax * t)
 *   A(t) = t + (1/μmax) * ln((exp(-μmax*t) + q0) / (1 + q0))
 *   ln N(t) = ln N0 + μmax * A(t) - ln(1 + (exp(μmax*A(t)) - 1) / exp(ln Nmax - ln N0))
 *
 * Где q0 связан с лаг-временем λ:
 *   λ = ln(1 + 1/q0) / μmax → q0 = 1 / (exp(μmax * λ) - 1)
 */
function baranyiGrowthModel(params) {
  const {
    N0,
    Nmax,
    temperature,
    maxTime,
    timeStep = 1,
    lagTime,
    Tmin = -1.5,
    b = 0.0317,
    h0 = 0.5    // Параметр физиологического состояния (0.1–2.0)
  } = params;

  const n0 = parseFloat(N0);
  const nmax = parseFloat(Nmax);
  const T = parseFloat(temperature);
  const tMax = parseFloat(maxTime);
  const dt = parseFloat(timeStep) || 1;

  if (n0 >= nmax) throw new Error('N0 не может быть ≥ Nmax.');
  if (T <= Tmin) {
    return {
      temperature: T,
      muMax: 0,
      lagTime_hours: Infinity,
      timeToSpoilage: null,
      dataPoints: [],
      interpretation: `При T = ${T}°C рост микроорганизмов не происходит (T ≤ Tmin = ${Tmin}°C).`
    };
  }

  const muMax = ratkowskyMuMax(T, Tmin, b);

  // q0 из параметра h0 (параметр физиологического состояния по Баранья)
  //   h0 = q0 / (1 + q0) → q0 = h0 / (1 - h0), при h0 < 1
  //   или напрямую: q0 = 1/(exp(μmax * λ) - 1)
  let q0;
  let lagTime_h;
  if (lagTime !== undefined) {
    const lambda = parseFloat(lagTime);
    if (lambda <= 0) {
      q0 = 1e10; // Нет лаг-фазы
    } else {
      q0 = 1.0 / (Math.exp(muMax * lambda) - 1);
    }
    lagTime_h = lambda;
  } else {
    // Оценка через h0
    q0 = parseFloat(h0);
    lagTime_h = Math.log(1 + 1 / q0) / muMax;
  }

  const lnN0 = Math.log(n0);
  const lnNmax = Math.log(nmax);
  const dataPoints = [];
  let timeToSpoilage = null;
  // Порог порчи: 10^7 КОЕ/г (типовой для большинства продуктов)
  const SPOILAGE_THRESHOLD = 1e7;

  for (let t = 0; t <= tMax; t += dt) {
    // Вычисление вспомогательной функции A(t)
    const qt = q0 * Math.exp(muMax * t);
    const At = t + (1 / muMax) * Math.log((q0 + Math.exp(-muMax * t)) / (1 + q0));

    // ln N(t) по Баранья
    let lnNt;
    const expTerm = Math.exp(muMax * At);
    if (expTerm > 1e15) {
      lnNt = lnNmax; // Достигнута стационарная фаза
    } else {
      const denom = 1 + (expTerm - 1) / Math.exp(lnNmax - lnN0);
      lnNt = lnN0 + muMax * At - Math.log(denom);
    }
    lnNt = Math.min(lnNt, lnNmax);

    const Nt = Math.exp(lnNt);
    const logNt = Math.log10(Math.max(Nt, 1));

    dataPoints.push({
      time_h: parseFloat(t.toFixed(2)),
      N_cfu_g: parseFloat(Nt.toFixed(2)),
      log10N: parseFloat(logNt.toFixed(4)),
      phase: determineGrowthPhase(t, lagTime_h, muMax, Nt, nmax)
    });

    if (Nt >= SPOILAGE_THRESHOLD && timeToSpoilage === null) {
      timeToSpoilage = t;
    }
  }

  const generationTime = Math.log(2) / muMax;

  return {
    model: 'Baranyi & Roberts (1994)',
    parameters: {
      N0_cfu_g: n0,
      Nmax_cfu_g: nmax,
      temperature_C: T,
      muMax_per_hour: parseFloat(muMax.toFixed(6)),
      q0: parseFloat(q0.toFixed(6)),
      lagTime_hours: parseFloat(lagTime_h.toFixed(2)),
      generationTime_hours: parseFloat(generationTime.toFixed(2))
    },
    timeToSpoilage_hours: timeToSpoilage,
    timeToSpoilage_days: timeToSpoilage ? parseFloat((timeToSpoilage / 24).toFixed(2)) : null,
    dataPoints,
    interpretation: generateMicrobialInterpretation(timeToSpoilage, T, muMax)
  };
}

function determineGrowthPhase(t, lagTime, muMax, Nt, Nmax) {
  if (t < lagTime) return 'Лаг-фаза (адаптация)';
  if (Nt >= Nmax * 0.95) return 'Стационарная фаза';
  if (Nt >= Nmax * 0.5) return 'Замедленный рост';
  return 'Экспоненциальный рост (лог-фаза)';
}

function generateMicrobialInterpretation(timeToSpoilage, temperature, muMax) {
  if (timeToSpoilage === null) {
    return `При T = ${temperature}°C за расчётный период продукт не достигает уровня порчи (>10⁷ КОЕ/г). μmax = ${muMax.toFixed(4)} ч⁻¹.`;
  }
  const days = (timeToSpoilage / 24).toFixed(1);
  let riskLevel;
  if (timeToSpoilage < 24) riskLevel = 'КРИТИЧЕСКИЙ';
  else if (timeToSpoilage < 72) riskLevel = 'ВЫСОКИЙ';
  else if (timeToSpoilage < 168) riskLevel = 'СРЕДНИЙ';
  else riskLevel = 'НИЗКИЙ';

  return `Уровень микробиологической порчи (>10⁷ КОЕ/г) достигается через ${timeToSpoilage.toFixed(1)} ч (≈${days} сут) при T=${temperature}°C. μmax = ${muMax.toFixed(4)} ч⁻¹. УРОВЕНЬ РИСКА: ${riskLevel}.`;
}

// ─── 3. Логистическая модель Вуда ─────────────────────────────────────────────
/**
 * Модифицированная логистика (Wood / Verhulst):
 *   N(t) = Nmax / (1 + ((Nmax / N0) - 1) * exp(-r * t))
 * Где:
 *   r — максимальная удельная скорость роста (ч⁻¹)
 *   Nmax — максимальная концентрация
 *   N0 — начальная концентрация
 */
function woodGrowthModel(params) {
  const {
    N0,
    Nmax = 1e9,
    r,
    maxTime,
    timeStep = 1
  } = params;

  const n0 = parseFloat(N0);
  const nmax = parseFloat(Nmax);
  const growthRate = parseFloat(r);
  const tMax = parseFloat(maxTime);
  const dt = parseFloat(timeStep) || 1;

  if (isNaN(growthRate) || growthRate <= 0) throw new Error('r (скорость роста) должна быть > 0.');
  if (n0 >= nmax) throw new Error('N0 не может быть ≥ Nmax.');

  const dataPoints = [];
  let timeToSpoilage = null;
  const SPOILAGE_THRESHOLD = 1e7;

  for (let t = 0; t <= tMax; t += dt) {
    const Nt = nmax / (1 + ((nmax / n0) - 1) * Math.exp(-growthRate * t));
    const logNt = Math.log10(Math.max(Nt, 1));
    dataPoints.push({
      time_h: parseFloat(t.toFixed(2)),
      N_cfu_g: parseFloat(Nt.toFixed(2)),
      log10N: parseFloat(logNt.toFixed(4))
    });
    if (Nt >= SPOILAGE_THRESHOLD && timeToSpoilage === null) {
      timeToSpoilage = t;
    }
  }

  const generationTime = Math.log(2) / growthRate;

  return {
    model: 'Wood Logistic Growth (Verhulst-Pearl)',
    parameters: {
      N0_cfu_g: n0,
      Nmax_cfu_g: nmax,
      r_per_hour: growthRate,
      generationTime_hours: parseFloat(generationTime.toFixed(2))
    },
    timeToSpoilage_hours: timeToSpoilage,
    timeToSpoilage_days: timeToSpoilage ? parseFloat((timeToSpoilage / 24).toFixed(2)) : null,
    dataPoints
  };
}

// ─── 4. Второй закон диффузии Фика ───────────────────────────────────────────
/**
 * Динамика влагосодержания продукта при хранении.
 *
 * Аналитическое решение для плоской пластины (единственная гармоника):
 *   (M(t) - Meq) / (M0 - Meq) = (8/π²) * Σ [1/(2n+1)²] * exp(-D*(2n+1)²*π²*t / L²)
 *
 * Для практических расчётов — первый член ряда достаточен при t > 0.05*L²/D:
 *   MR(t) = (8/π²) * exp(-π² * D * t / L²)
 *   M(t) = Meq + (M0 - Meq) * MR(t)
 *
 * Где:
 *   D — эффективный коэффициент диффузии влаги (м²/с)
 *   L — полутолщина продукта (м) (для пластины: L = толщина/2)
 *   t — время (с)
 *   M0 — начальная влажность (%)
 *   Meq — равновесная влажность (%)
 */
function fickMoistureDiffusion(params) {
  const {
    M0,
    Meq,
    diffusionCoeff,  // D, м²/с
    thickness,       // полная толщина, м (L = thickness/2)
    maxTime,         // максы время, часы
    timeStep = 1,    // шаг, часы
    nTerms = 10      // количество членов ряда Фурье
  } = params;

  const m0 = parseFloat(M0);
  const meq = parseFloat(Meq);
  const D = parseFloat(diffusionCoeff);
  const fullThickness = parseFloat(thickness);
  const tMax_h = parseFloat(maxTime);
  const dt_h = parseFloat(timeStep) || 1;
  const L = fullThickness / 2; // Полутолщина для двустороннего переноса

  if (m0 <= meq && D > 0) {
    // Увлажнение (поглощение влаги)
  }
  if (Math.abs(m0 - meq) < 0.001) {
    return {
      status: 'Равновесие достигнуто сразу',
      dataPoints: [{ time_h: 0, moisture_percent: m0, MR: 1 }]
    };
  }

  const dataPoints = [];
  let timeToEquilibrium = null;
  const EQUILIBRIUM_THRESHOLD = 0.01; // 1% от начального перепада

  for (let t_h = 0; t_h <= tMax_h; t_h += dt_h) {
    const t_s = t_h * SECONDS_PER_HOUR; // Перевод в секунды

    // Ряд Фурье — n членов
    let sumFourier = 0;
    for (let n = 0; n < nTerms; n++) {
      const term = (2 * n + 1);
      sumFourier += (1 / Math.pow(term, 2)) * Math.exp(-D * Math.pow(term * Math.PI, 2) * t_s / Math.pow(L, 2));
    }
    const MR = (8 / Math.pow(Math.PI, 2)) * sumFourier;
    const MR_clamped = Math.max(0, Math.min(1, MR));

    const Mt = meq + (m0 - meq) * MR_clamped;

    dataPoints.push({
      time_h: parseFloat(t_h.toFixed(2)),
      moisture_percent: parseFloat(Mt.toFixed(4)),
      MR: parseFloat(MR_clamped.toFixed(6)),
      drying_rate: parseFloat(Math.abs((m0 - meq) * D * Math.pow(Math.PI, 2) * MR_clamped / Math.pow(L, 2)).toFixed(8))
    });

    if (MR_clamped <= EQUILIBRIUM_THRESHOLD && timeToEquilibrium === null) {
      timeToEquilibrium = t_h;
    }
  }

  // Характерное время диффузии τ = L² / (π² * D)
  const characteristicTime_s = Math.pow(L, 2) / (Math.pow(Math.PI, 2) * D);
  const characteristicTime_h = characteristicTime_s / SECONDS_PER_HOUR;

  return {
    model: '2-й закон диффузии Фика (ряд Фурье)',
    parameters: {
      M0_percent: m0,
      Meq_percent: meq,
      D_m2_per_s: D,
      thickness_m: fullThickness,
      halfThickness_m: L,
      nFourierTerms: nTerms
    },
    characteristicDiffusionTime_hours: parseFloat(characteristicTime_h.toFixed(2)),
    timeToEquilibrium_hours: timeToEquilibrium,
    dataPoints,
    interpretation: generateMoistureInterpretation(m0, meq, timeToEquilibrium, D)
  };
}

function generateMoistureInterpretation(M0, Meq, timeToEq, D) {
  const direction = M0 > Meq ? 'Десорбция (потеря влаги)' : 'Адсорбция (поглощение влаги)';
  const deltaM = Math.abs(M0 - Meq).toFixed(2);
  let eqText = timeToEq
    ? `Равновесная влажность ${Meq}% достигается приблизительно через ${timeToEq.toFixed(1)} ч.`
    : 'За расчётный период равновесие не достигнуто.';
  return `${direction}. Начальная влажность: ${M0}%, равновесная: ${Meq}%. Разница: ${deltaM}%. D = ${D.toExponential(3)} м²/с. ${eqText}`;
}

// ─── 5. Комплексный прогноз срока годности ────────────────────────────────────
function predictShelfLife(params) {
  const {
    product,
    storageTemp,
    initialMicrobialLoad,
    initialMoisture,
    storageRH,
    packaging
  } = params;

  const physChem = product.physicochemical || {};

  // Параметры микробиологической модели из БД продукта или дефолт
  const microParams = product.microbiologicalModel || {};
  const Tmin = microParams.Tmin || -1.5;
  const b = microParams.b || 0.0317;
  const Nmax = microParams.Nmax || 1e8;
  const h0 = microParams.h0 || 0.5;

  // Параметры влагопереноса
  const moistureParams = product.moistureModel || {};
  const D_moisture = moistureParams.diffusionCoeff || 1e-10;
  const thickness = moistureParams.thickness || 0.02;
  const Meq_at_RH = calculateEquilibriumMoisture(storageRH, product.groupName);

  // Запуск моделей
  let microbialResult = null;
  let moistureResult = null;

  try {
    microbialResult = baranyiGrowthModel({
      N0: initialMicrobialLoad,
      Nmax: Nmax,
      temperature: storageTemp,
      maxTime: 720, // 30 суток
      timeStep: 4,
      h0: h0,
      Tmin: Tmin,
      b: b
    });
  } catch (e) {
    microbialResult = { error: e.message };
  }

  try {
    moistureResult = fickMoistureDiffusion({
      M0: initialMoisture,
      Meq: Meq_at_RH,
      diffusionCoeff: D_moisture,
      thickness: thickness,
      maxTime: 720,
      timeStep: 4
    });
  } catch (e) {
    moistureResult = { error: e.message };
  }

  // Ограничивающий фактор срока годности
  const microbialShelfLife = microbialResult?.timeToSpoilage_days;
  const moistureShelfLife = estimateMoistureShelfLife(
    initialMoisture, Meq_at_RH, physChem.moisture, moistureResult
  );

  const packagingFactor = getPackagingFactor(packaging);
  let estimatedShelfLife_days = null;
  let limitingFactor = '';

  if (microbialShelfLife && moistureShelfLife) {
    const adjustedMicrobial = microbialShelfLife * packagingFactor;
    const adjustedMoisture = moistureShelfLife * packagingFactor;
    if (adjustedMicrobial <= adjustedMoisture) {
      estimatedShelfLife_days = parseFloat(adjustedMicrobial.toFixed(1));
      limitingFactor = 'Микробиологическая порча (КМАФАнМ)';
    } else {
      estimatedShelfLife_days = parseFloat(adjustedMoisture.toFixed(1));
      limitingFactor = 'Изменение влажности (выход за пределы ГОСТ)';
    }
  } else if (microbialShelfLife) {
    estimatedShelfLife_days = parseFloat((microbialShelfLife * packagingFactor).toFixed(1));
    limitingFactor = 'Микробиологическая порча';
  } else if (moistureShelfLife) {
    estimatedShelfLife_days = parseFloat((moistureShelfLife * packagingFactor).toFixed(1));
    limitingFactor = 'Изменение влажности';
  }

  return {
    storageConditions: { temperature_C: storageTemp, relativeHumidity_percent: storageRH, packaging },
    estimatedShelfLife_days,
    limitingFactor,
    packagingFactor,
    microbialKinetics: microbialResult,
    moistureDynamics: moistureResult,
    recommendations: generateShelfLifeRecommendations(
      estimatedShelfLife_days, storageTemp, limitingFactor, packaging
    )
  };
}

function calculateEquilibriumMoisture(RH, groupName) {
  // Упрощённая изотерма сорбции GAB для разных групп продуктов
  const baseEq = {
    'bread': 0.55 * RH / (100 - 0.02 * RH),
    'meat':  0.35 * RH / (100 - 0.01 * RH),
    'dairy': 0.45 * RH / (100 - 0.015 * RH),
    'default': 0.5 * RH / (100 - 0.018 * RH)
  };
  const key = (groupName || '').toLowerCase();
  let meq;
  if (key.includes('хлеб')) meq = baseEq.bread;
  else if (key.includes('мяс')) meq = baseEq.meat;
  else if (key.includes('молоч')) meq = baseEq.dairy;
  else meq = baseEq.default;
  return Math.max(2, Math.min(35, parseFloat(meq.toFixed(2))));
}

function estimateMoistureShelfLife(M0, Meq, moistureStandard, moistureResult) {
  if (!moistureStandard || !moistureResult || moistureResult.error) return null;
  const maxAllowed = moistureStandard.max;
  const minAllowed = moistureStandard.min;
  if (!maxAllowed && !minAllowed) return null;

  // Найти время, когда влажность выходит за пределы стандарта
  const points = moistureResult.dataPoints || [];
  for (const point of points) {
    const M = point.moisture_percent;
    if ((maxAllowed && M > maxAllowed) || (minAllowed && M < minAllowed)) {
      return point.time_h / 24;
    }
  }
  return null;
}

function getPackagingFactor(packaging) {
  const factors = {
    'vacuum': 2.5,
    'modified_atmosphere': 2.0,
    'hermetic': 1.8,
    'standard': 1.0,
    'open': 0.6
  };
  return factors[packaging] || 1.0;
}

function generateShelfLifeRecommendations(shelfLife, temperature, limitingFactor, packaging) {
  const recs = [];
  if (limitingFactor.includes('Микробиологическая')) {
    recs.push('Снизить температуру хранения на 2-4°C для замедления роста микроорганизмов.');
    recs.push('Применить упаковку в модифицированной атмосфере (МАП) — CO₂/N₂.');
    recs.push('Добавить натуральные консерванты (нисин, низин, сорбат калия).');
    recs.push('Усилить санитарно-гигиенический контроль на производстве (ГМП/ГГП).');
  }
  if (limitingFactor.includes('влажност')) {
    recs.push('Использовать барьерную влагонепроницаемую упаковку (PVDC, Al-фольга).');
    recs.push('Добавить осушитель или регулятор активности воды (aw).');
    recs.push('Контролировать ОВВ в камере хранения (целевой диапазон для каждого продукта).');
  }
  if (packaging === 'open') {
    recs.push('Перейти на герметичную или вакуумную упаковку для увеличения срока годности.');
  }
  if (temperature > 6 && !limitingFactor.includes('замороженн')) {
    recs.push(`Рекомендуется снижение температуры хранения (текущая: ${temperature}°C).`);
  }
  if (shelfLife && shelfLife < 3) {
    recs.push('КРИТИЧНО: Расчётный срок годности менее 3 суток. Немедленно пересмотреть технологию производства и условия хранения.');
  }
  return recs;
}

module.exports = {
  baranyiGrowthModel,
  woodGrowthModel,
  fickMoistureDiffusion,
  predictShelfLife,
  ratkowskyMuMax
};