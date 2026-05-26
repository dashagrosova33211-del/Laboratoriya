'use strict';

/**
 * Физико-химический калькулятор.
 * Все формулы соответствуют ГОСТ 3624-92, ГОСТ 3626-73,
 * ГОСТ 5667-65, ГОСТ 26188-84, ГОСТ Р 51740-2016.
 */

/**
 * Расчёт кислотности методом титрования.
 * Формула (ГОСТ 3624-92, ГОСТ 5670-96):
 *   T = (V * N * K * F) / m * 100
 * Где:
 *   V — объём NaOH, затраченный на титрование (мл)
 *   N — нормальность раствора NaOH (моль-экв/л)
 *   K — поправочный коэффициент к нормальности раствора NaOH
 *   F — фактор пересчёта (для молочных продуктов = 100/9; для хлеба = 100/5.12)
 *   m — масса навески (г)
 *
 * Результат: кислотность в градусах Тернера (°Т)
 */
function calculateAcidity(params) {
  const {
    sampleMass,
    naohVolume,
    naohNormality = 0.1,
    coefficient = 1.0,
    productType = 'dairy',
    dilutionFactor = 1
  } = params;

  const m = parseFloat(sampleMass);
  const V = parseFloat(naohVolume);
  const N = parseFloat(naohNormality);
  const K = parseFloat(coefficient);
  const D = parseFloat(dilutionFactor);

  if (isNaN(m) || m <= 0) throw new Error('Масса навески (sampleMass) некорректна.');
  if (isNaN(V) || V < 0) throw new Error('Объём NaOH (naohVolume) некорректен.');

  // Фактор пересчёта зависит от типа продукта
  const factorMap = {
    dairy:  100 / 9,     // Молочные (молоко, сметана) — 1 мл 0.1 N NaOH ≈ 1°Т
    bread:  100 / 5.12,  // Хлеб и хлебобулочные
    meat:   1,           // Мясные (используется pH/кислотность мг/г)
    fish:   1,
    fruit:  1,
    confectionery: 100 / 9
  };
  const F = factorMap[productType] || 100 / 9;

  // Основная формула Тернера:
  //   Если N = 0.1 и K = 1, то T = V * F / m * (используемый объём при разбавлении)
  const acidity = (V * N * 10 * K * F * D) / m;

  const roundedAcidity = Math.round(acidity * 100) / 100;

  return {
    parameter: 'Кислотность',
    unit: '°Т (градусы Тернера)',
    formula: 'T = (V × N × 10 × K × F × D) / m',
    variables: { V_ml: V, N_normality: N, K_coeff: K, F_factor: F, D_dilution: D, m_g: m },
    result: roundedAcidity,
    calculationSteps: [
      `1. Объём NaOH на титрование: V = ${V} мл`,
      `2. Нормальность NaOH: N = ${N} н.`,
      `3. Поправочный коэффициент: K = ${K}`,
      `4. Фактор пересчёта для типа "${productType}": F = ${F.toFixed(4)}`,
      `5. Масса навески: m = ${m} г`,
      `6. T = (${V} × ${N} × 10 × ${K} × ${F.toFixed(4)} × ${D}) / ${m}`,
      `7. T = ${roundedAcidity} °Т`
    ]
  };
}

/**
 * Расчёт влажности методом высушивания (термогравиметрия).
 * Формула (ГОСТ 21094-75, ГОСТ 9793-74):
 *   W = ((m1 - m2) / m_nav) * 100
 * Где:
 *   m1 — масса бюксы с навеской ДО высушивания (г)
 *   m2 — масса бюксы с навеской ПОСЛЕ высушивания (г)
 *   m_nav — масса навески = m1 - m_buksa (г)
 *
 * Результат: влажность в %
 */
function calculateMoisture(params) {
  const {
    massBefore,         // Масса бюксы с пробой до сушки (г)
    massAfter,          // Масса бюксы с пробой после сушки (г)
    massBuksa,          // Масса пустой бюксы (г)
    sampleMass          // Или прямо масса навески (г) — альтернатива
  } = params;

  const m1 = parseFloat(massBefore);
  const m2 = parseFloat(massAfter);

  if (isNaN(m1) || m1 <= 0) throw new Error('massBefore (масса до сушки) некорректна.');
  if (isNaN(m2) || m2 <= 0) throw new Error('massAfter (масса после сушки) некорректна.');
  if (m1 <= m2) throw new Error('Масса до сушки не может быть меньше или равна массе после сушки.');

  let m_nav;
  if (sampleMass) {
    m_nav = parseFloat(sampleMass);
  } else if (massBuksa) {
    m_nav = m1 - parseFloat(massBuksa);
  } else {
    throw new Error('Необходимо указать massBuksa (масса пустой бюксы) или sampleMass (масса навески).');
  }

  if (m_nav <= 0) throw new Error('Масса навески должна быть положительной.');

  const moistureLoss = m1 - m2;
  const moisture = (moistureLoss / m_nav) * 100;
  const roundedMoisture = Math.round(moisture * 100) / 100;

  return {
    parameter: 'Влажность',
    unit: '%',
    formula: 'W = ((m1 - m2) / m_nav) × 100',
    variables: { m1_g: m1, m2_g: m2, m_nav_g: m_nav, moistureLoss_g: moistureLoss },
    result: roundedMoisture,
    calculationSteps: [
      `1. Масса бюксы + проба ДО сушки: m1 = ${m1} г`,
      `2. Масса бюксы + проба ПОСЛЕ сушки: m2 = ${m2} г`,
      `3. Масса навески: m_nav = ${m_nav} г`,
      `4. Потеря при высушивании: Δm = ${m1} - ${m2} = ${moistureLoss.toFixed(4)} г`,
      `5. W = (${moistureLoss.toFixed(4)} / ${m_nav}) × 100`,
      `6. W = ${roundedMoisture} %`
    ]
  };
}

/**
 * Расчёт массовой доли жира методом Гербера (ГОСТ 5867-90)
 * или методом Сокслета (ГОСТ 29033-91).
 * Формула Сокслета:
 *   X = ((m_col - m_empty) / m_nav) * 100
 */
function calculateFatContent(params) {
  const {
    sampleMass,
    colbalFatMass,   // Масса колбы с жиром после экстракции (г)
    colbalEmptyMass, // Масса пустой колбы (г)
    gerberReading    // Показание бутирометра Гербера (% жира) — альтернатива
  } = params;

  if (gerberReading !== undefined) {
    // Метод Гербера — прямое считывание с бутирометра
    const fat = parseFloat(gerberReading);
    if (isNaN(fat) || fat < 0) throw new Error('gerberReading некорректен.');
    return {
      parameter: 'Массовая доля жира (метод Гербера)',
      unit: '%',
      formula: 'X = прямое считывание бутирометра',
      result: Math.round(fat * 10) / 10,
      calculationSteps: [
        `1. Прямое считывание показания бутирометра Гербера: ${fat} %`,
        `2. X = ${Math.round(fat * 10) / 10} %`
      ]
    };
  }

  const m_nav = parseFloat(sampleMass);
  const m_col = parseFloat(colbalFatMass);
  const m_empty = parseFloat(colbalEmptyMass);

  if (isNaN(m_nav) || m_nav <= 0) throw new Error('sampleMass некорректна.');
  if (isNaN(m_col) || m_col <= 0) throw new Error('colbalFatMass некорректна.');
  if (isNaN(m_empty) || m_empty <= 0) throw new Error('colbalEmptyMass некорректна.');
  if (m_col < m_empty) throw new Error('Масса колбы с жиром не может быть меньше массы пустой колбы.');

  const fatMass = m_col - m_empty;
  const fat = (fatMass / m_nav) * 100;
  const rounded = Math.round(fat * 100) / 100;

  return {
    parameter: 'Массовая доля жира (метод Сокслета)',
    unit: '%',
    formula: 'X = ((m_кол.с жиром - m_пустой кол.) / m_навески) × 100',
    variables: { sampleMass_g: m_nav, fatExtracted_g: fatMass, colbalFatMass_g: m_col, colbalEmptyMass_g: m_empty },
    result: rounded,
    calculationSteps: [
      `1. Масса пустой колбы: m_empty = ${m_empty} г`,
      `2. Масса колбы с жиром после экстракции: m_col = ${m_col} г`,
      `3. Масса навески: m_nav = ${m_nav} г`,
      `4. Масса извлечённого жира: Δm = ${m_col} - ${m_empty} = ${fatMass.toFixed(4)} г`,
      `5. X = (${fatMass.toFixed(4)} / ${m_nav}) × 100`,
      `6. X = ${rounded} %`
    ]
  };
}

/**
 * Расчёт массовой доли поваренной соли аргентометрическим методом (ГОСТ 26186-84).
 * Формула:
 *   X = (V * N * 0.05845 * K * 100) / m
 * Где:
 *   V — объём AgNO3, ушедший на титрование (мл)
 *   N — нормальность AgNO3 (0.05 н. стандартно)
 *   0.05845 — молярная масса NaCl / 1000 (г/мл·н.)
 *   K — поправочный коэффициент
 *   m — масса навески (г)
 *
 * Результат: массовая доля NaCl, %
 */
function calculateSaltContent(params) {
  const {
    sampleMass,
    agno3Volume,
    agno3Normality = 0.05,
    coefficient = 1.0,
    dilutionFactor = 1
  } = params;

  const m = parseFloat(sampleMass);
  const V = parseFloat(agno3Volume);
  const N = parseFloat(agno3Normality);
  const K = parseFloat(coefficient);
  const D = parseFloat(dilutionFactor);

  if (isNaN(m) || m <= 0) throw new Error('sampleMass некорректна.');
  if (isNaN(V) || V < 0) throw new Error('agno3Volume некорректен.');

  const NaCl_molar_mass_factor = 0.05845; // г/мл·н.

  const salt = (V * N * NaCl_molar_mass_factor * K * D * 100) / m;
  const rounded = Math.round(salt * 100) / 100;

  return {
    parameter: 'Массовая доля поваренной соли',
    unit: '%',
    formula: 'X = (V × N × 0.05845 × K × D × 100) / m',
    variables: { V_ml: V, N_normality: N, K_coeff: K, D_dilution: D, m_g: m },
    result: rounded,
    calculationSteps: [
      `1. Объём AgNO3 на титрование: V = ${V} мл`,
      `2. Нормальность AgNO3: N = ${N} н.`,
      `3. Молярная масса NaCl / 1000: 0.05845 г/мл·н.`,
      `4. Коэффициент пересчёта: K = ${K}`,
      `5. Фактор разбавления: D = ${D}`,
      `6. Масса навески: m = ${m} г`,
      `7. X = (${V} × ${N} × 0.05845 × ${K} × ${D} × 100) / ${m}`,
      `8. X = ${rounded} %`
    ]
  };
}

/**
 * Расчёт массовой доли белка методом Кьельдаля (ГОСТ 23327-98).
 * Формула:
 *   X_N = ((V1 - V0) * N * 0.014 * 100) / m
 *   X_protein = X_N * F
 * Где:
 *   V1 — объём HCl на титрование пробы (мл)
 *   V0 — объём HCl на холостой опыт (мл)
 *   N — нормальность HCl
 *   0.014 — атомная масса азота / 1000
 *   F — коэффициент пересчёта N → белок (6.25 для большинства продуктов; 5.83 для зерна)
 */
function calculateProteinContent(params) {
  const {
    sampleMass,
    hclVolumeTest,
    hclVolumeBlank,
    hclNormality = 0.1,
    proteinFactor = 6.25
  } = params;

  const m = parseFloat(sampleMass);
  const V1 = parseFloat(hclVolumeTest);
  const V0 = parseFloat(hclVolumeBlank) || 0;
  const N = parseFloat(hclNormality);
  const F = parseFloat(proteinFactor);

  if (isNaN(m) || m <= 0) throw new Error('sampleMass некорректна.');
  if (isNaN(V1) || V1 < 0) throw new Error('hclVolumeTest некорректен.');

  const nitrogenContent = ((V1 - V0) * N * 0.014 * 100) / m;
  const proteinContent = nitrogenContent * F;
  const rounded = Math.round(proteinContent * 100) / 100;

  return {
    parameter: 'Массовая доля белка (метод Кьельдаля)',
    unit: '%',
    formula: 'X_белок = ((V1-V0) × N × 0.014 × 100 / m) × F',
    variables: { V1_ml: V1, V0_ml: V0, N_normality: N, F_protein_factor: F, m_g: m },
    nitrogenContent: Math.round(nitrogenContent * 100) / 100,
    result: rounded,
    calculationSteps: [
      `1. V1 (проба) = ${V1} мл, V0 (холостой) = ${V0} мл`,
      `2. ΔV = ${V1} - ${V0} = ${(V1 - V0).toFixed(2)} мл`,
      `3. N HCl = ${N} н.`,
      `4. X_N = (${(V1-V0).toFixed(2)} × ${N} × 0.014 × 100) / ${m} = ${nitrogenContent.toFixed(4)} %`,
      `5. Коэффициент F = ${F}`,
      `6. X_белок = ${nitrogenContent.toFixed(4)} × ${F} = ${rounded} %`
    ]
  };
}

module.exports = {
  calculateAcidity,
  calculateMoisture,
  calculateFatContent,
  calculateSaltContent,
  calculateProteinContent
};