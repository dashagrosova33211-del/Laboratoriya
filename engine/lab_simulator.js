'use strict';

/**
 * Движок симуляции лабораторных работ.
 * Реализует пошаговый интерактивный процесс экспертизы продовольственных товаров
 * в соответствии с действующими ГОСТ и методическими указаниями.
 */

// ─── Описания шагов для каждого типа эксперимента ─────────────────────────────
const EXPERIMENT_PROTOCOLS = {

  titration: {
    name: 'Определение кислотности методом титрования',
    gostRef: 'ГОСТ 3624-92, ГОСТ 5670-96, ГОСТ 26188-84',
    equipment: ['Бюретка 25 мл', 'Конические колбы 250 мл', 'Пипетки 10 мл', 'Весы аналитические', 'Дистиллированная вода', '1% р-р фенолфталеина'],
    reagents: ['Раствор NaOH 0.1 н.', 'Дистиллированная вода', '1% спиртовой р-р фенолфталеина'],
    steps: [
      {
        step: 1,
        name: 'Подготовка пробы',
        description: 'Взвешивание навески продукта. Для молочных продуктов: 5 г; для хлеба: 25 г; для мясных: 10 г.',
        inputs: [
          { field: 'sampleMass', label: 'Масса навески (г)', type: 'number', min: 0.1, max: 100 },
          { field: 'waterVolume', label: 'Объём добавленной воды для растворения (мл)', type: 'number', min: 10, max: 200 }
        ],
        instruction: 'Взвесить навеску с точностью ±0.001 г. При необходимости измельчить и растворить в дистиллированной воде при 40°C.',
        safety: 'Используйте перчатки и защитные очки при работе с щелочами.'
      },
      {
        step: 2,
        name: 'Подготовка бюретки и реагентов',
        description: 'Заполнение бюретки раствором NaOH, проверка нулевой отметки.',
        inputs: [
          { field: 'initialBuretteLevel', label: 'Начальный уровень бюретки (мл)', type: 'number', min: 0, max: 25 },
          { field: 'naohNormality', label: 'Нормальность NaOH (н.)', type: 'number', min: 0.01, max: 1.0 }
        ],
        instruction: 'Заполнить бюретку раствором NaOH. Убрать пузырьки воздуха. Установить мениск на нулевую отметку. Проверить поправочный коэффициент K к нормальности.'
      },
      {
        step: 3,
        name: 'Добавление индикатора',
        description: 'Добавление фенолфталеина в анализируемую пробу.',
        inputs: [
          { field: 'indicatorDrops', label: 'Количество капель фенолфталеина', type: 'number', min: 1, max: 5 },
          { field: 'initialColor', label: 'Цвет раствора до титрования', type: 'select',
            options: ['Бесцветный', 'Слабо-молочный', 'Слегка желтоватый', 'Коричневатый'] }
        ],
        instruction: 'Добавить 2-3 капли 1% спиртового раствора фенолфталеина. Раствор должен оставаться бесцветным или слабо окрашенным.'
      },
      {
        step: 4,
        name: 'Титрование',
        description: 'Медленное прибавление NaOH из бюретки до появления устойчивой слабо-розовой окраски (не исчезает в течение 1 мин).',
        inputs: [
          { field: 'finalBuretteLevel', label: 'Конечный уровень бюретки после титрования (мл)', type: 'number', min: 0, max: 25 },
          { field: 'endpointColor', label: 'Цвет раствора в точке эквивалентности', type: 'select',
            options: ['Слабо-розовый (не исчезает 1 мин)', 'Ярко-розовый', 'Малиновый', 'Бесцветный'] },
          { field: 'isValid', label: 'Признать титрование валидным?', type: 'boolean' }
        ],
        instruction: 'Титровать медленно, тщательно перемешивая. Точка эквивалентности — стойкое слабо-розовое окрашивание. Параллельно провести контрольное титрование (3 параллельных опыта).'
      },
      {
        step: 5,
        name: 'Расчёт и регистрация результатов',
        description: 'Вычисление объёма NaOH и передача данных в калькулятор.',
        inputs: [
          { field: 'parallel1_volume', label: 'Объём NaOH, параллель 1 (мл)', type: 'number' },
          { field: 'parallel2_volume', label: 'Объём NaOH, параллель 2 (мл)', type: 'number' },
          { field: 'parallel3_volume', label: 'Объём NaOH, параллель 3 (мл)', type: 'number' },
          { field: 'coefficient', label: 'Поправочный коэффициент K', type: 'number', default: 1.0 }
        ],
        instruction: 'Расхождение между параллельными опытами не должно превышать 0.5°Т (ГОСТ 3624-92). Взять среднеарифметическое трёх определений.'
      }
    ]
  },

  drying: {
    name: 'Определение влажности методом высушивания',
    gostRef: 'ГОСТ 21094-75, ГОСТ 9793-74, ГОСТ 24557-89',
    equipment: ['Сушильный шкаф', 'Аналитические весы', 'Бюксы (металл или стекло)', 'Эксикатор с силикагелем', 'Щипцы тигельные'],
    reagents: ['Силикагель обезвоженный'],
    steps: [
      {
        step: 1,
        name: 'Подготовка бюксы',
        description: 'Высушивание пустой бюксы для установления постоянной массы.',
        inputs: [
          { field: 'buksaNumber', label: 'Номер бюксы', type: 'text' },
          { field: 'massBuksaEmpty', label: 'Масса пустой бюксы (г)', type: 'number', min: 5, max: 100 },
          { field: 'dryingTempEmpty', label: 'Температура предварительного высушивания (°C)', type: 'number', default: 103 }
        ],
        instruction: 'Бюксу высушить при 103±2°C до постоянной массы (2 взвешивания с разницей ≤0.0005 г).'
      },
      {
        step: 2,
        name: 'Загрузка пробы',
        description: 'Помещение навески продукта в тарированную бюксу.',
        inputs: [
          { field: 'massBefore', label: 'Масса бюксы + проба ДО сушки (г)', type: 'number' },
          { field: 'sampleDescription', label: 'Описание пробы', type: 'text' }
        ],
        instruction: 'Навеску хлеба 5г, мяса 3-5г, молочных продуктов 3-5г поместить в бюксу, равномерно распределить.'
      },
      {
        step: 3,
        name: 'Высушивание',
        description: 'Помещение открытой бюксы в сушильный шкаф.',
        inputs: [
          { field: 'dryingTemp', label: 'Температура высушивания (°C)', type: 'number', default: 130 },
          { field: 'dryingTime_min', label: 'Время высушивания (минуты)', type: 'number' },
          { field: 'dryingMode', label: 'Режим высушивания', type: 'select',
            options: ['Ускоренный (130°C, 45 мин)', 'Стандартный (103°C, 5-6 ч)', 'Для жиросодержащих (103°C, 3 ч)'] }
        ],
        instruction: 'При 130°C — ускоренный метод (хлеб, мучные изделия). При 103°C — точный метод. Крышку бюксы приоткрыть.'
      },
      {
        step: 4,
        name: 'Охлаждение и взвешивание',
        description: 'Охлаждение бюксы в эксикаторе и определение массы после сушки.',
        inputs: [
          { field: 'coolingTime_min', label: 'Время охлаждения в эксикаторе (мин)', type: 'number', default: 20 },
          { field: 'massAfter', label: 'Масса бюксы + проба ПОСЛЕ сушки (г)', type: 'number' }
        ],
        instruction: 'Охладить закрытую бюксу в эксикаторе не менее 20 мин до комнатной температуры. Взвесить немедленно после извлечения.'
      },
      {
        step: 5,
        name: 'Проверка постоянства массы',
        description: 'Повторное высушивание для проверки постоянной массы.',
        inputs: [
          { field: 'massAfterRepeat', label: 'Масса после повторного высушивания (г)', type: 'number' },
          { field: 'dryingTimeRepeat_min', label: 'Время повторного высушивания (мин)', type: 'number', default: 30 }
        ],
        instruction: 'Если разница между двумя взвешиваниями >0.01г, повторить сушку. Постоянная масса — основа точного результата.'
      }
    ]
  },

  extraction: {
    name: 'Определение массовой доли жира методом Сокслета',
    gostRef: 'ГОСТ 29033-91, ГОСТ Р 55694-2013',
    equipment: ['Аппарат Сокслета', 'Колба круглодонная 200 мл', 'Бумажные экстракционные гильзы', 'Сушильный шкаф', 'Ротационный испаритель'],
    reagents: ['Петролейный эфир (40-60°C кипения)', 'Этиловый эфир'],
    steps: [
      {
        step: 1,
        name: 'Подготовка навески и гильзы',
        description: 'Взвешивание навески, помещение в бумажную гильзу.',
        inputs: [
          { field: 'sampleMass', label: 'Масса навески (г)', type: 'number' },
          { field: 'gilzaNumber', label: 'Номер гильзы', type: 'text' }
        ],
        instruction: 'Навеску 3-5 г поместить в гильзу. Сверху закрыть ватным тампоном. Высушить в шкафу при 103°C, 1 час перед экстракцией.'
      },
      {
        step: 2,
        name: 'Подготовка приёмной колбы',
        description: 'Тарирование приёмной колбы.',
        inputs: [
          { field: 'colbalEmptyMass', label: 'Масса пустой тарированной колбы (г)', type: 'number' }
        ],
        instruction: 'Колбу высушить при 100°C, охладить в эксикаторе 30 мин, взвесить.'
      },
      {
        step: 3,
        name: 'Экстракция',
        description: 'Непрерывная экстракция жира растворителем.',
        inputs: [
          { field: 'extractVolume_ml', label: 'Объём растворителя (мл)', type: 'number', default: 150 },
          { field: 'extractionTime_h', label: 'Время экстракции (часы)', type: 'number', default: 6 },
          { field: 'cyclesCount', label: 'Количество промывочных циклов', type: 'number' }
        ],
        instruction: 'Экстракция петролейным эфиром при температуре кипения 40-60°C, не менее 5-6 часов. Проверить полноту экстракции: капля растворителя на стекле не должна оставлять жирового пятна.'
      },
      {
        step: 4,
        name: 'Отгонка растворителя и взвешивание',
        description: 'Удаление растворителя и определение массы извлечённого жира.',
        inputs: [
          { field: 'colbalFatMass', label: 'Масса колбы с жиром после отгонки (г)', type: 'number' }
        ],
        instruction: 'Отогнать растворитель на водяной бане или ротационном испарителе. Высушить при 100°C до постоянной массы. Охладить в эксикаторе, взвесить.'
      },
      {
        step: 5,
        name: 'Расчёт результата',
        description: 'Вычисление массовой доли жира.',
        inputs: [
          { field: 'parallel_sampleMass', label: 'Масса навески параллельного опыта (г)', type: 'number' },
          { field: 'parallel_fatMass', label: 'Масса жира параллельного опыта (г)', type: 'number' }
        ],
        instruction: 'Рассчитать X для обоих опытов. Расхождение ≤0.3% (сыр) или ≤0.5% (мясо). Взять среднее.'
      }
    ]
  },

  salt_determination: {
    name: 'Определение массовой доли соли аргентометрическим методом Мора',
    gostRef: 'ГОСТ 26186-84, ГОСТ 9957-73',
    equipment: ['Бюретка 25 мл', 'Конические колбы 250 мл', 'Пипетки', 'Мерные колбы 250 мл', 'Весы аналитические'],
    reagents: ['Раствор AgNO3 0.05 н.', 'Дистиллированная вода (без хлоридов)', '10% раствор K₂CrO₄'],
    steps: [
      {
        step: 1,
        name: 'Приготовление водной вытяжки',
        description: 'Экстракция NaCl из продукта горячей водой.',
        inputs: [
          { field: 'sampleMass', label: 'Масса навески (г)', type: 'number' },
          { field: 'waterVolume', label: 'Объём горячей воды (60-70°C) для экстракции (мл)', type: 'number', default: 100 },
          { field: 'extractionTime_min', label: 'Время настаивания (мин)', type: 'number', default: 30 }
        ],
        instruction: 'Навеску (хлеб 25г, мясо 5г) залить горячей водой 60-70°C. Настаивать 30 мин, периодически помешивая. Охладить, перенести в мерную колбу 250 мл.'
      },
      {
        step: 2,
        name: 'Фильтрация и разбавление до метки',
        description: 'Фильтрация мутных вытяжек и доведение до объёма.',
        inputs: [
          { field: 'filtrationDone', label: 'Фильтрация выполнена?', type: 'boolean' },
          { field: 'finalVolume', label: 'Финальный объём вытяжки (мл)', type: 'number', default: 250 }
        ],
        instruction: 'Через складчатый бумажный фильтр. Первые 10-15 мл фильтрата отбросить. Довести дистиллированной водой до метки 250 мл.'
      },
      {
        step: 3,
        name: 'Отбор аликвоты и добавление индикатора',
        description: 'Взятие аликвоты для титрования.',
        inputs: [
          { field: 'aliquotVolume', label: 'Объём аликвоты (мл)', type: 'number', default: 10 },
          { field: 'indicatorK2CrO4_ml', label: 'Объём индикатора K₂CrO₄ (мл)', type: 'number', default: 0.5 }
        ],
        instruction: 'Пипеткой отобрать 10 мл фильтрата. Добавить 0.5 мл 10% K₂CrO₄. Раствор окрасится в жёлтый цвет — это норма.'
      },
      {
        step: 4,
        name: 'Титрование AgNO3',
        description: 'Титрование хлоридов раствором азотнокислого серебра до появления кирпично-красного осадка.',
        inputs: [
          { field: 'agno3Volume', label: 'Объём AgNO3 на титрование (мл)', type: 'number' },
          { field: 'endpointColor', label: 'Цвет в точке эквивалентности', type: 'select',
            options: ['Кирпично-красный осадок Ag₂CrO₄', 'Оранжевый', 'Красно-коричневый'] }
        ],
        instruction: 'Точка эквивалентности — появление устойчивого кирпично-красного осадка Ag₂CrO₄. До этого образуется AgCl (белый осадок). Провести 3 параллельных опыта.'
      },
      {
        step: 5,
        name: 'Контрольный опыт и расчёт',
        description: 'Контрольное титрование дистиллированной воды.',
        inputs: [
          { field: 'blankVolume', label: 'Объём AgNO3 на контрольный опыт (мл)', type: 'number', default: 0 },
          { field: 'agno3Normality', label: 'Нормальность AgNO3 (н.)', type: 'number', default: 0.05 },
          { field: 'coefficient', label: 'Поправочный коэффициент K', type: 'number', default: 1.0 },
          { field: 'dilutionFactor', label: 'Фактор разбавления (V_total / V_aliquot)', type: 'number', default: 25 }
        ],
        instruction: 'V_net = V_проба - V_контрольный. Расхождение параллелей ≤0.07% (ГОСТ 26186-84).'
      }
    ]
  }
};

/**
 * Инициализация эксперимента
 */
function initExperiment(product, experimentType) {
  const protocol = EXPERIMENT_PROTOCOLS[experimentType];
  if (!protocol) {
    throw new Error(`Протокол для типа эксперимента '${experimentType}' не найден.`);
  }

  return {
    totalSteps: protocol.steps.length,
    experimentName: protocol.name,
    gostReference: protocol.gostRef,
    equipment: protocol.equipment,
    reagents: protocol.reagents,
    safetyRequirements: [
      'Работа в лабораторном халате и перчатках обязательна.',
      'При работе с кислотами и щелочами — защитные очки.',
      'Легковоспламеняющиеся растворители использовать вдали от открытого огня.',
      'Все работы проводить под вытяжным шкафом.'
    ],
    currentStep: 1,
    steps: protocol.steps,
    productContext: {
      name: product.name,
      referenceValues: product.physicochemical,
      gost: product.standards?.gost
    }
  };
}

/**
 * Выполнение конкретного шага эксперимента
 */
function executeStep(experimentType, step, rawData) {
  const protocol = EXPERIMENT_PROTOCOLS[experimentType];
  if (!protocol) {
    throw new Error(`Неизвестный тип эксперимента: ${experimentType}`);
  }
  const stepDef = protocol.steps.find(s => s.step === parseInt(step));
  if (!stepDef) {
    throw new Error(`Шаг ${step} не найден в протоколе.`);
  }

  // Валидация введённых данных
  const validationResults = [];
  const warnings = [];

  for (const inputDef of (stepDef.inputs || [])) {
    const value = rawData[inputDef.field];
    if (value === undefined || value === null || value === '') {
      if (inputDef.type !== 'boolean') {
        validationResults.push({ field: inputDef.field, status: 'missing', message: `Поле "${inputDef.label}" не заполнено.` });
      }
      continue;
    }
    if (inputDef.type === 'number') {
      const numVal = parseFloat(value);
      if (isNaN(numVal)) {
        validationResults.push({ field: inputDef.field, status: 'invalid', message: `Поле "${inputDef.label}" должно быть числом.` });
      }
      if (inputDef.min !== undefined && numVal < inputDef.min) {
        warnings.push(`${inputDef.label}: значение ${numVal} ниже минимального (${inputDef.min}).`);
      }
      if (inputDef.max !== undefined && numVal > inputDef.max) {
        warnings.push(`${inputDef.label}: значение ${numVal} выше максимального (${inputDef.max}).`);
      }
    }
  }

  // Специальные проверки для конкретных шагов
  let specialChecks = [];
  if (experimentType === 'titration' && step === 5) {
    const v1 = parseFloat(rawData.parallel1_volume) || 0;
    const v2 = parseFloat(rawData.parallel2_volume) || 0;
    const v3 = parseFloat(rawData.parallel3_volume) || 0;
    if (v1 && v2 && v3) {
      const mean = (v1 + v2 + v3) / 3;
      const maxDev = Math.max(Math.abs(v1 - mean), Math.abs(v2 - mean), Math.abs(v3 - mean));
      specialChecks.push({
        check: 'Сходимость параллельных опытов',
        meanVolume_ml: parseFloat(mean.toFixed(3)),
        maxDeviation_ml: parseFloat(maxDev.toFixed(3)),
        acceptable: maxDev <= 0.1,
        status: maxDev <= 0.1 ? 'НОРМА' : 'ПРЕВЫШЕНИЕ — повторить определение'
      });
    }
  }

  if (experimentType === 'drying' && step === 5) {
    const mAfter1 = parseFloat(rawData.massAfter) || 0;
    const mAfter2 = parseFloat(rawData.massAfterRepeat) || 0;
    if (mAfter1 && mAfter2) {
      const diff = Math.abs(mAfter1 - mAfter2);
      specialChecks.push({
        check: 'Постоянство массы (расхождение взвешиваний)',
        diff_g: parseFloat(diff.toFixed(5)),
        acceptable: diff <= 0.001,
        status: diff <= 0.001 ? 'ПОСТОЯННАЯ МАССА ДОСТИГНУТА' : 'Требуется дополнительное высушивание'
      });
    }
  }

  const hasErrors = validationResults.some(r => r.status === 'missing' || r.status === 'invalid');

  return {
    step,
    stepName: stepDef.name,
    description: stepDef.description,
    instruction: stepDef.instruction,
    validationStatus: hasErrors ? 'ERROR' : 'OK',
    validationResults,
    warnings,
    specialChecks,
    nextStep: step < protocol.steps.length ? step + 1 : null,
    isLastStep: step === protocol.steps.length,
    recordedData: rawData,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  initExperiment,
  executeStep,
  EXPERIMENT_PROTOCOLS
};