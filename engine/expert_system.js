'use strict';

/**
 * Экспертная система для генерации официальных заключений
 * и ХАССП-анализа продовольственных товаров.
 *
 * Логика соответствия определяется локально на основе эталонных значений ГОСТ
 * из базы данных knowledge_base.json.
 */

// ─── Встроенная база ККТ по группам продуктов (ХАССП) ────────────────────────
const BUILTIN_HACCP_CCPs = {
  meat: {
    groupName: 'Мясные и мясосодержащие продукты',
    regulatoryBasis: 'ТР ТС 021/2011 "О безопасности пищевой продукции", ГОСТ Р ИСО 22000-2019',
    ccps: [
      {
        id: 'meat_ccp_1',
        number: 'ККТ-1',
        processStep: 'Приёмка сырья',
        hazard: 'Биологический: контаминация Salmonella spp., E.coli O157:H7, Listeria monocytogenes',
        monitoringParam: 'Температура сырья при приёмке, ветеринарные сопроводительные документы',
        criticalLimit: 'T ≤ 4°C (охлаждённое), T ≤ -18°C (замороженное); наличие ВСД',
        correctiveActions: [
          'Отклонение по температуре: немедленно вернуть поставщику, составить акт несоответствия.',
          'Отсутствие ВСД: изолировать партию, запрос документов у поставщика.',
          'Провести внеплановую микробиологическую проверку партии.'
        ],
        verificationProcedure: 'Ежедневная проверка записей по температуре; ежеквартальный микробиологический мониторинг'
      },
      {
        id: 'meat_ccp_2',
        number: 'ККТ-2',
        processStep: 'Термическая обработка (варка/запекание)',
        hazard: 'Биологический: выживание патогенов при недостаточном нагреве',
        monitoringParam: 'Температура в центре продукта',
        criticalLimit: 'T ≥ 72°C в течение ≥ 15 сек (птица ≥ 80°C); для консервов F0 ≥ 3',
        correctiveActions: [
          'Переработать партию с повторной термообработкой до достижения критического предела.',
          'Проверить и откалибровать термодатчики.',
          'Изолировать продукт до получения результатов микробиологического анализа.'
        ],
        verificationProcedure: 'Каждая партия — непрерывный мониторинг температуры с регистрацией в журнале ТО'
      },
      {
        id: 'meat_ccp_3',
        number: 'ККТ-3',
        processStep: 'Охлаждение и хранение готовой продукции',
        hazard: 'Биологический: рост Listeria monocytogenes; Химический: окисление жиров (прогоркание)',
        monitoringParam: 'Температура в камере хранения, срок годности, кислотное число жира',
        criticalLimit: 'T ≤ +6°C; КМАФАнМ ≤ 1×10⁶ КОЕ/г; кислотное число ≤ 3 мг KOH/г',
        correctiveActions: [
          'Перенастроить холодильное оборудование.',
          'Партию с просроченным сроком годности изъять из обращения.',
          'Провести дополнительный микробиологический контроль.'
        ],
        verificationProcedure: 'Мониторинг T каждые 2 часа; микробиологический контроль каждой партии'
      }
    ]
  },

  dairy: {
    groupName: 'Молочные и молокосодержащие продукты',
    regulatoryBasis: 'ТР ТС 033/2013 "О безопасности молока и молочной продукции"',
    ccps: [
      {
        id: 'dairy_ccp_1',
        number: 'ККТ-1',
        processStep: 'Приёмка молока-сырья',
        hazard: 'Биологический: наличие антибиотиков, патогенов (Brucella, Mycobacterium, Staphylococcus aureus)',
        monitoringParam: 'КМАФАнМ, соматические клетки, температура, ингибирующие вещества',
        criticalLimit: 'КМАФАнМ ≤ 1×10⁵ КОЕ/мл; сомат. клетки ≤ 400 тыс/мл; T ≤ 10°C; антибиотики: отсутствие',
        correctiveActions: [
          'При превышении КМАФАнМ: молоко не принимается, акт несоответствия.',
          'Положительный тест на антибиотики: немедленный отказ от партии, уведомление Россельхознадзора.',
          'Провести расследование источника контаминации у поставщика.'
        ],
        verificationProcedure: 'Каждая партия: экспресс-тест на антибиотики; еженедельно — полный КМАФАнМ'
      },
      {
        id: 'dairy_ccp_2',
        number: 'ККТ-2',
        processStep: 'Пастеризация',
        hazard: 'Биологический: выживание термоустойчивых патогенов и БГКП',
        monitoringParam: 'Температура пастеризации и время выдержки',
        criticalLimit: 'ВТLТ: T ≥ 72°C, τ ≥ 15 сек; LTLT: T ≥ 63°C, τ ≥ 30 мин; UHT: T ≥ 135°C, τ ≥ 2 сек',
        correctiveActions: [
          'Повторная пастеризация при несоответствии режима.',
          'Немедленная остановка оборудования при сбое температурного датчика.',
          'Изолировать и проверить всю продукцию, выпущенную в период сбоя.'
        ],
        verificationProcedure: 'Непрерывная запись температуры; ежедневная проверка тест-культурой на эффективность пастеризации'
      }
    ]
  },

  bread: {
    groupName: 'Хлебобулочные и мучные кондитерские изделия',
    regulatoryBasis: 'ТР ТС 021/2011, ГОСТ 31805-2018',
    ccps: [
      {
        id: 'bread_ccp_1',
        number: 'ККТ-1',
        processStep: 'Выпечка',
        hazard: 'Биологический: выживание Bacillus subtilis, плесеней; Химический: акриламид при перегреве',
        monitoringParam: 'Температура в центре хлеба, температура печи, время выпечки',
        criticalLimit: 'T в центре ≥ 95°C; акриламид ≤ 50 мкг/кг (ТР ЕС 2017/2158)',
        correctiveActions: [
          'При недопёке: доведение до кондиции или утилизация.',
          'Регулировка температурного режима печи.',
          'Контроль цвета корки (показатель Маяра): золотисто-коричневый = норма.'
        ],
        verificationProcedure: 'Каждая партия — органолептика + температура центра; еженедельно — лабораторный контроль'
      },
      {
        id: 'bread_ccp_2',
        number: 'ККТ-2',
        processStep: 'Хранение готовой продукции',
        hazard: 'Биологический: развитие плесеней Aspergillus, Penicillium; Картофельная болезнь хлеба',
        monitoringParam: 'Влажность мякиша, ОВВ в камере хранения, температура',
        criticalLimit: 'W мякиша ≤ 43% (пшеничный), ≤ 47% (ржаной); ОВВ ≤ 75%; T ≤ 25°C',
        correctiveActions: [
          'При появлении признаков картофельной болезни: изъять всю партию, продезинфицировать оборудование.',
          'Усилить влагопоглощение упаковки при высокой влажности мякиша.',
          'Снизить ОВВ в камере хранения.'
        ],
        verificationProcedure: 'Ежедневный органолептический контроль; еженедельно — влажность'
      }
    ]
  },

  fish: {
    groupName: 'Рыбные продукты и морепродукты',
    regulatoryBasis: 'ТР ЕАЭС 040/2016 "О безопасности рыбы и рыбной продукции"',
    ccps: [
      {
        id: 'fish_ccp_1',
        number: 'ККТ-1',
        processStep: 'Приёмка сырья и хранение',
        hazard: 'Биологический: гистамин (скомбротоксин), Clostridium botulinum, паразиты',
        monitoringParam: 'Температура сырья, содержание гистамина, органолептика',
        criticalLimit: 'Гистамин ≤ 100 мг/кг (ТР ЕАЭС 040/2016); T ≤ -18°C (замороженная)',
        correctiveActions: [
          'Превышение гистамина: немедленное изъятие, акт на уничтожение.',
          'Нарушение холодовой цепи: оценить органолептику, при сомнении — лабораторная экспертиза.'
        ],
        verificationProcedure: 'Каждая партия: органолептика, температура; 1 раз/квартал: гистамин'
      }
    ]
  },

  beverages: {
    groupName: 'Безалкогольные и слабоалкогольные напитки',
    regulatoryBasis: 'ТР ТС 021/2011, ГОСТ Р 55878-2013',
    ccps: [
      {
        id: 'bev_ccp_1',
        number: 'ККТ-1',
        processStep: 'Водоподготовка',
        hazard: 'Химический: хлор, тяжёлые металлы, нитраты; Микробиологический: кишечные патогены',
        monitoringParam: 'рН, жёсткость, остаточный хлор, КМАФАнМ воды',
        criticalLimit: 'pH 6.5-8.5; жёсткость ≤ 7 ммоль/л; хлор ≤ 0.3 мг/л; КМАФАнМ ≤ 50 КОЕ/мл',
        correctiveActions: [
          'Остановить производство при несоответствии воды.',
          'Провести промывку и дезинфекцию системы водоподготовки.'
        ],
        verificationProcedure: 'Ежедневно: pH, хлор; еженедельно: КМАФАнМ; ежеквартально: полный анализ'
      }
    ]
  },

  fruits_vegetables: {
    groupName: 'Плодоовощная продукция',
    regulatoryBasis: 'ТР ТС 021/2011, ГОСТ Р 54057-2010',
    ccps: [
      {
        id: 'fv_ccp_1',
        number: 'ККТ-1',
        processStep: 'Мойка и дезинфекция',
        hazard: 'Биологический: БГКП, E.coli, Salmonella; Химический: остатки пестицидов',
        monitoringParam: 'Концентрация дезинфектанта, температура воды, время обработки',
        criticalLimit: 'Хлор 100-200 мг/л или надуксусная кислота 80-200 мг/л; T ≥ 10°C',
        correctiveActions: [
          'При недостаточной концентрации дезинфектанта: повторная обработка.',
          'Провести смывы с поверхностей для микробиологического контроля.'
        ],
        verifierProcedure: 'Ежедневно: концентрация дезинфектанта; еженедельно: смывы'
      }
    ]
  }
};

// ─── Генератор нарушений и рекомендаций ──────────────────────────────────────
const DEVIATION_RECOMMENDATIONS = {
  acidity_high: {
    defectName: 'Повышенная кислотность',
    possibleCauses: [
      'Нарушение температурного режима хранения (повышенная температура)',
      'Превышение нормативного срока годности',
'Интенсивное развитие молочнокислых бактерий при нарушении санитарии',
      'Использование сырья с исходно высокой кислотностью',
      'Несоблюдение рецептуры (избыток заквасочных культур)'
    ],
    recommendations: [
      'Снизить температуру хранения до нормативной.',
      'Провести входной контроль сырья по показателю кислотности.',
      'Проверить соблюдение сроков годности на всех этапах цепочки поставок.',
      'Пересмотреть дозировку заквасочной культуры в рецептуре.',
      'Усилить санитарный контроль производственных помещений и оборудования (АМС-обработка).'
    ],
    haccpCcp: 'ККТ-3 (Хранение готовой продукции)',
    riskLevel: 'СРЕДНИЙ',
    disposition: 'Продукт не подлежит реализации. Направить на повторную экспертизу или переработку.'
  },

  acidity_low: {
    defectName: 'Пониженная кислотность',
    possibleCauses: [
      'Применение ингибиторов (антибиотики в молочном сырье)',
      'Использование незрелого сырья',
      'Нарушение технологического режима сквашивания (низкая температура)',
      'Фальсификация: разбавление водой (для молочных продуктов)'
    ],
    recommendations: [
      'Провести тест на ингибирующие вещества (антибиотики) в сырье.',
      'Откорректировать режим сквашивания (температура, время, дозировка закваски).',
      'Проверить наличие фальсификации методом криоскопии (для молока).',
      'Провести микробиологический анализ закваски на активность.'
    ],
    haccpCcp: 'ККТ-1 (Приёмка сырья), ККТ-2 (Технологическая обработка)',
    riskLevel: 'СРЕДНИЙ',
    disposition: 'Партия задержана. Проведение дополнительных анализов обязательно.'
  },

  moisture_high: {
    defectName: 'Повышенная влажность',
    possibleCauses: [
      'Нарушение режима выпечки/сушки/сгущения',
      'Неудовлетворительная упаковка (пропускает влагу)',
      'Хранение при повышенной относительной влажности воздуха',
      'Конденсация при резких перепадах температуры',
      'Нарушение технологии охлаждения горячего продукта'
    ],
    recommendations: [
      'Пересмотреть и откалибровать режим термообработки (температура, время).',
      'Проверить герметичность упаковочного материала (влагопроницаемость WVTR).',
      'Снизить ОВВ в камерах хранения до нормативных значений.',
      'Организовать постепенное охлаждение продукта во избежание конденсата.',
      'Ввести контроль влажности упаковочного воздуха при MAP-упаковке.'
    ],
    haccpCcp: 'ККТ-2 (Термическая обработка), ККТ-3 (Хранение)',
    riskLevel: 'ВЫСОКИЙ',
    disposition: 'Продукт направить на переработку или утилизацию. Нарушение требований ГОСТ.'
  },

  moisture_low: {
    defectName: 'Пониженная влажность',
    possibleCauses: [
      'Избыточная термообработка (пересушивание)',
      'Хранение при пониженной относительной влажности воздуха',
      'Несоответствие упаковочного материала (паропроницаемость выше нормы)',
      'Нарушение рецептуры (недостаточное количество воды при замесе)'
    ],
    recommendations: [
      'Сократить время и/или снизить температуру термообработки.',
      'Обеспечить нормативную ОВВ в камерах хранения.',
      'Применить увлажнение на конечном этапе производства.',
      'Пересмотреть состав рецептуры (влагоудерживающие агенты: CMC, каррагинан).'
    ],
    haccpCcp: 'ККТ-2 (Термическая обработка)',
    riskLevel: 'НИЗКИЙ',
    disposition: 'Продукт может быть реализован при соответствии остальным показателям. Рекомендуется корректировка технологии.'
  },

  fat_high: {
    defectName: 'Повышенная массовая доля жира',
    possibleCauses: [
      'Фальсификация: использование растительных жиров вместо молочного (для молочной продукции)',
      'Нарушение рецептуры (избыток жирового компонента)',
      'Ошибка нормализации молока по жиру',
      'Некорректная партия сырья от поставщика'
    ],
    recommendations: [
      'Провести идентификацию жира методом ГХ-МС на состав жирных кислот (ГОСТ 32915-2014).',
      'Провести тест на фальсификацию растительными жирами (β-ситостерин).',
      'Проверить работу сепаратора-нормализатора.',
      'Запросить у поставщика декларацию соответствия и сертификаты качества сырья.'
    ],
    haccpCcp: 'ККТ-1 (Приёмка и контроль сырья)',
    riskLevel: 'ВЫСОКИЙ (возможна фальсификация)',
    disposition: 'Партия задержана. Проведение идентификационной экспертизы обязательно.'
  },

  fat_low: {
    defectName: 'Пониженная массовая доля жира',
    possibleCauses: [
      'Ошибка нормализации (избыточное обезжиривание)',
      'Использование обезжиренного сырья без пересчёта рецептуры',
      'Фальсификация: разбавление обезжиренным аналогом'
    ],
    recommendations: [
      'Откалибровать систему нормализации молока.',
      'Провести пересчёт рецептуры с учётом жирности входящего сырья.',
      'Ввести обязательный входной контроль жирности сырья при каждой партии.'
    ],
    haccpCcp: 'ККТ-1 (Приёмка сырья)',
    riskLevel: 'СРЕДНИЙ',
    disposition: 'Продукт не соответствует маркировке. Реализация запрещена до перемаркировки или переработки.'
  },

  salt_high: {
    defectName: 'Повышенная массовая доля поваренной соли',
    possibleCauses: [
      'Нарушение дозировки соли при посоле/посолке',
      'Ошибка в расчёте рассола при мокром посоле',
      'Неравномерное распределение соли в продукте',
      'Использование нестандартного солесодержащего сырья'
    ],
    recommendations: [
      'Откалибровать дозирующее оборудование для соли.',
      'Провести расчёт и коррекцию рецептуры рассола.',
      'Ввести систему весового контроля соли при рецептурном составлении.',
      'Обратить особое внимание на ККТ снижения содержания соли для продуктов диетического питания.'
    ],
    haccpCcp: 'ККТ-2 (Технологическая обработка — посол)',
    riskLevel: 'СРЕДНИЙ',
    disposition: 'Продукт не соответствует ГОСТ. Реализация с пониженным содержанием соли — переработка или утилизация.'
  },

  salt_low: {
    defectName: 'Пониженная массовая доля поваренной соли',
    possibleCauses: [
      'Недостаточная дозировка соли',
      'Вымывание соли при нарушении технологии',
      'Использование заменителей соли без коррекции рецептуры'
    ],
    recommendations: [
      'Скорректировать рецептуру и дозировку соли.',
      'Проверить степень просаливания органолептически и инструментально.',
      'При использовании заменителей соли (KCl): провести пересчёт эквивалентной дозировки.'
    ],
    haccpCcp: 'ККТ-2 (Технологическая обработка)',
    riskLevel: 'НИЗКИЙ',
    disposition: 'Продукт реализации не подлежит в случае значительного отклонения. Корректировка технологии.'
  },

  kmafanm_high: {
    defectName: 'Превышение КМАФАнМ (Количество мезофильных аэробных и факультативно анаэробных микроорганизмов)',
    possibleCauses: [
      'Нарушение температурного режима хранения',
      'Истечение или превышение срока годности',
      'Нарушение санитарно-гигиенических норм на производстве',
      'Вторичная контаминация после тепловой обработки',
      'Несоблюдение холодовой цепи при транспортировании'
    ],
    recommendations: [
      'НЕМЕДЛЕННО изъять продукт из обращения — риск для здоровья потребителей.',
      'Провести внеплановую дезинфекцию производственных помещений и оборудования.',
      'Проверить и откалибровать систему холодного хранения.',
      'Провести расследование причин вторичной контаминации.',
      'Временно приостановить производство для санитарной проверки.',
      'Уведомить Роспотребнадзор при выявлении в реализованной продукции.',
      'Провести микробиологический мониторинг производственной среды (смывы).'
    ],
    haccpCcp: 'ККТ-2 (Термическая обработка), ККТ-3 (Хранение и транспортирование)',
    riskLevel: 'КРИТИЧЕСКИЙ',
    disposition: 'НЕМЕДЛЕННЫЙ ОТЗЫВ ПАРТИИ. Продукт опасен для потребления. Утилизация под контролем Роспотребнадзора.'
  },

  protein_low: {
    defectName: 'Пониженная массовая доля белка',
    possibleCauses: [
      'Фальсификация: разбавление или замена белкового сырья',
      'Нарушение рецептуры (недостаток белкового компонента)',
      'Использование нестандартного сырья с низким содержанием белка',
      'Денатурация белка при избыточной термообработке (потеря при анализе)'
    ],
    recommendations: [
      'Провести идентификацию видового состава сырья (ПЦР-анализ для мясных продуктов).',
      'Пересчитать рецептуру с коррекцией белкового баланса.',
      'Провести входной контроль сырья по содержанию белка (ГОСТ 23327-98).',
      'При подозрении на фальсификацию — направить на арбитражную экспертизу.'
    ],
    haccpCcp: 'ККТ-1 (Приёмка и идентификация сырья)',
    riskLevel: 'СРЕДНИЙ',
    disposition: 'Партия задержана. Обязательная дополнительная экспертиза.'
  }
};

// ─── Вспомогательные функции ──────────────────────────────────────────────────

/**
 * Сравнение измеренного значения с нормативным диапазоном ГОСТ.
 * @returns { status, deviation, deviationKey }
 */
function compareWithStandard(paramName, measuredValue, referenceRange) {
  if (measuredValue === null || measuredValue === undefined) {
    return { status: 'NOT_MEASURED', deviation: null, deviationKey: null };
  }
  const val = parseFloat(measuredValue);
  if (isNaN(val)) {
    return { status: 'INVALID_DATA', deviation: null, deviationKey: null };
  }

  const min = referenceRange?.min !== undefined ? parseFloat(referenceRange.min) : null;
  const max = referenceRange?.max !== undefined ? parseFloat(referenceRange.max) : null;

  let status = 'COMPLIANT';
  let deviationKey = null;
  let deviationPercent = null;

  if (max !== null && val > max) {
    status = 'NON_COMPLIANT_HIGH';
    deviationPercent = parseFloat((((val - max) / max) * 100).toFixed(2));
    deviationKey = `${paramName}_high`;
  } else if (min !== null && val < min) {
    status = 'NON_COMPLIANT_LOW';
    deviationPercent = parseFloat((((min - val) / min) * 100).toFixed(2));
    deviationKey = `${paramName}_low`;
  }

  return {
    status,
    measuredValue: val,
    referenceMin: min,
    referenceMax: max,
    deviation: deviationPercent,
    deviationKey,
    complianceText: status === 'COMPLIANT'
      ? `✓ Соответствует (${formatRange(min, max)})`
      : `✗ Не соответствует (измерено: ${val}, норма: ${formatRange(min, max)}, отклонение: ${deviationPercent}%)`
  };
}

function formatRange(min, max) {
  if (min !== null && max !== null) return `от ${min} до ${max}`;
  if (min !== null) return `не менее ${min}`;
  if (max !== null) return `не более ${max}`;
  return 'не нормируется';
}

/**
 * Определение органолептического балла
 */
function assessOrganoleptics(organolepticsData) {
  if (!organolepticsData) return null;
  const scores = [
    organolepticsData.appearance,
    organolepticsData.smell,
    organolepticsData.taste,
    organolepticsData.texture
  ].filter(s => s !== undefined && s !== null).map(Number);

  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);

  let verdict;
  if (avg >= 4.5 && minScore >= 4) verdict = 'ОТЛИЧНО';
  else if (avg >= 3.5 && minScore >= 3) verdict = 'ХОРОШО';
  else if (avg >= 2.5 && minScore >= 2) verdict = 'УДОВЛЕТВОРИТЕЛЬНО';
  else verdict = 'НЕУДОВЛЕТВОРИТЕЛЬНО';

  return {
    appearance: organolepticsData.appearance,
    smell: organolepticsData.smell,
    taste: organolepticsData.taste,
    texture: organolepticsData.texture,
    averageScore: parseFloat(avg.toFixed(2)),
    minScore,
    verdict,
    isCompliant: avg >= 3.5 && minScore >= 3
  };
}

/**
 * Получение ККТ для группы продуктов
 */
function getCriticalControlPoints(productGroup, haccpDb) {
  // Сначала ищем во внешней БД ХАССП, затем в встроенной
  if (haccpDb && haccpDb[productGroup]) {
    return haccpDb[productGroup];
  }
  // Маппинг ключей групп на встроенную БД
  const groupMapping = {
    meat:             'meat',
    mясные:           'meat',
    dairy:            'dairy',
    молочные:         'dairy',
    bread:            'bread',
    хлебобулочные:    'bread',
    fish:             'fish',
    рыбные:           'fish',
    beverages:        'beverages',
    напитки:          'beverages',
    fruits_vegetables: 'fruits_vegetables',
    плодоовощные:     'fruits_vegetables',
    confectionery:    'bread', // Кондитерские близки к хлебобулочным
    кондитерские:     'bread'
  };
  const key = groupMapping[productGroup.toLowerCase()] || productGroup.toLowerCase();
  return BUILTIN_HACCP_CCPs[key] || {
    groupName: productGroup,
    regulatoryBasis: 'ТР ТС 021/2011 "О безопасности пищевой продукции"',
    ccps: [],
    message: `Специализированные ККТ для группы "${productGroup}" не найдены. Применяются общие требования ТР ТС 021/2011.`
  };
}

/**
 * Генерация ХАССП-отчёта по выявленным нарушениям
 */
function generateHACCPReport(params) {
  const { product, productGroup, violations, haccpDb } = params;
  const ccpData = getCriticalControlPoints(productGroup, haccpDb);
  const timestamp = new Date().toISOString();

  // Собираем все релевантные ККТ по выявленным нарушениям
  const affectedCCPs = [];
  const allRecommendations = new Set();
  let overallRiskLevel = 'НИЗКИЙ';
  const riskHierarchy = { 'НИЗКИЙ': 0, 'СРЕДНИЙ': 1, 'ВЫСОКИЙ': 2, 'КРИТИЧЕСКИЙ': 3 };

  for (const violation of violations) {
    const devInfo = DEVIATION_RECOMMENDATIONS[violation.deviationKey];
    if (devInfo) {
      devInfo.recommendations.forEach(r => allRecommendations.add(r));

      // Обновляем максимальный уровень риска
      const violationRisk = devInfo.riskLevel.split(' ')[0]; // Берём первое слово
      if ((riskHierarchy[violationRisk] || 0) > (riskHierarchy[overallRiskLevel] || 0)) {
        overallRiskLevel = violationRisk;
      }

      // Находим соответствующие ККТ
      const relatedCcps = (ccpData.ccps || []).filter(ccp =>
        devInfo.haccpCcp && ccp.number && devInfo.haccpCcp.includes(ccp.number)
      );
      affectedCCPs.push(...relatedCcps);
    }
  }

  // Убираем дубликаты ККТ по id
  const uniqueCCPs = Array.from(
    new Map(affectedCCPs.map(ccp => [ccp.id, ccp])).values()
  );

  return {
    documentTitle: 'АНАЛИЗ РИСКОВ ПО ХАССП (HACCP RISK ANALYSIS)',
    timestamp,
    productName: product.name,
    productGroup,
    regulatoryBasis: ccpData.regulatoryBasis,
    violationsAnalyzed: violations.length,
    overallRiskLevel,
    affectedCriticalControlPoints: uniqueCCPs,
    allCriticalControlPoints: ccpData.ccps || [],
    consolidatedRecommendations: Array.from(allRecommendations),
    preventiveMeasures: generatePreventiveMeasures(overallRiskLevel, violations),
    documentationRequired: generateRequiredDocumentation(overallRiskLevel),
    nextAuditRecommended: getNextAuditDate(overallRiskLevel)
  };
}

function generatePreventiveMeasures(riskLevel, violations) {
  const measures = [
    'Обеспечить ведение журналов контроля в ККТ в соответствии с планом ХАССП.',
    'Провести инструктаж персонала по выявленным несоответствиям.',
    'Актуализировать план ХАССП с учётом выявленных рисков.'
  ];

  if (riskLevel === 'КРИТИЧЕСКИЙ') {
    measures.unshift('ОБЯЗАТЕЛЬНО: Немедленная остановка производства для проведения расследования.');
    measures.unshift('ОБЯЗАТЕЛЬНО: Изъять из обращения все продукты данной партии (отзыв продукции).');
    measures.unshift('ОБЯЗАТЕЛЬНО: Уведомить Роспотребнадзор в течение 24 часов.');
  } else if (riskLevel === 'ВЫСОКИЙ') {
    measures.unshift('Приостановить реализацию продукции до устранения несоответствий.');
    measures.unshift('Провести внеплановую аудиторскую проверку всей технологической линии.');
  } else if (riskLevel === 'СРЕДНИЙ') {
    measures.unshift('Усилить контроль на выявленных ККТ (увеличить частоту мониторинга).');
  }

  return measures;
}

function generateRequiredDocumentation(riskLevel) {
  const docs = [
    'Акт отбора проб и регистрация результатов анализов (ГОСТ ISO/IEC 17025)',
    'Журнал контроля ККТ (форма по плану ХАССП предприятия)',
    'Протокол испытаний с подписью ответственного лаборанта'
  ];
  if (riskLevel === 'ВЫСОКИЙ' || riskLevel === 'КРИТИЧЕСКИЙ') {
    docs.push('Акт несоответствия продукции (форма СМК)');
    docs.push('Уведомление об изъятии продукции из обращения');
    docs.push('Корректирующий план мероприятий (CAR — Corrective Action Report)');
  }
  if (riskLevel === 'КРИТИЧЕСКИЙ') {
    docs.push('Уведомление в Роспотребнадзор / ФГИС «Меркурий» (для продукции животного происхождения)');
    docs.push('Акт уничтожения или возврата опасной продукции');
  }
  return docs;
}

function getNextAuditDate(riskLevel) {
  const now = new Date();
  const addDays = (d, days) => new Date(d.getTime() + days * 86400000).toISOString().split('T')[0];
  const schedule = {
    'КРИТИЧЕСКИЙ': { days: 1,   text: 'Немедленно (в течение 24 часов)' },
    'ВЫСОКИЙ':     { days: 7,   text: 'В течение 7 суток' },
    'СРЕДНИЙ':     { days: 30,  text: 'В течение 30 суток (плановый)' },
    'НИЗКИЙ':      { days: 90,  text: 'В течение 90 суток (плановый квартальный)' }
  };
  const schedule_entry = schedule[riskLevel] || schedule['НИЗКИЙ'];
  return {
    recommendedDate: addDays(now, schedule_entry.days),
    description: schedule_entry.text
  };
}

// ─── ГЛАВНАЯ ФУНКЦИЯ: Генерация официального экспертного заключения ───────────
function generateConclusion(params) {
  const { product, measuredValues, storageConditions, sampleInfo, haccpDb } = params;
  const physChem = product.physicochemical || {};
  const standards = product.standards || {};
  const timestamp = new Date().toISOString();
  const conclusionNumber = `EXP-${Date.now().toString(36).toUpperCase()}`;

  // ── Шаг 1: Физико-химический анализ ─────────────────────────────────────────
  const parameterChecks = {};
  const violations = [];
  let overallCompliance = true;

  // Кислотность
  if (measuredValues.acidity !== undefined && physChem.acidity) {
    const check = compareWithStandard('acidity', measuredValues.acidity, physChem.acidity);
    parameterChecks.acidity = {
      paramNameRu: 'Кислотность',
      unit: physChem.acidity.unit || '°Т',
      gostRef: standards.gost,
      ...check
    };
    if (check.status !== 'COMPLIANT' && check.status !== 'NOT_MEASURED') {
      overallCompliance = false;
      violations.push({ paramName: 'acidity', paramNameRu: 'Кислотность', ...check });
    }
  }

  // Влажность
  if (measuredValues.moisture !== undefined && physChem.moisture) {
    const check = compareWithStandard('moisture', measuredValues.moisture, physChem.moisture);
    parameterChecks.moisture = {
      paramNameRu: 'Влажность',
      unit: '%',
      gostRef: standards.gost,
      ...check
    };
    if (check.status !== 'COMPLIANT' && check.status !== 'NOT_MEASURED') {
      overallCompliance = false;
      violations.push({ paramName: 'moisture', paramNameRu: 'Влажность', ...check });
    }
  }

  // Массовая доля жира
  if (measuredValues.fatContent !== undefined && physChem.fat) {
    const check = compareWithStandard('fat', measuredValues.fatContent, physChem.fat);
    parameterChecks.fat = {
      paramNameRu: 'Массовая доля жира',
      unit: '%',
      gostRef: standards.gost,
      ...check
    };
    if (check.status !== 'COMPLIANT' && check.status !== 'NOT_MEASURED') {
      overallCompliance = false;
      violations.push({ paramName: 'fat', paramNameRu: 'Массовая доля жира', ...check });
    }
  }

  // Массовая доля белка
  if (measuredValues.proteinContent !== undefined && physChem.protein) {
    const check = compareWithStandard('protein', measuredValues.proteinContent, physChem.protein);
    parameterChecks.protein = {
      paramNameRu: 'Массовая доля белка',
      unit: '%',
      gostRef: standards.gost,
      ...check
    };
    if (check.status !== 'COMPLIANT' && check.status !== 'NOT_MEASURED') {
      overallCompliance = false;
      violations.push({ paramName: 'protein', paramNameRu: 'Массовая доля белка', ...check });
    }
  }

  // Массовая доля соли
  if (measuredValues.saltContent !== undefined && physChem.salt) {
    const check = compareWithStandard('salt', measuredValues.saltContent, physChem.salt);
    parameterChecks.salt = {
      paramNameRu: 'Массовая доля поваренной соли',
      unit: '%',
      gostRef: standards.gost,
      ...check
    };
    if (check.status !== 'COMPLIANT' && check.status !== 'NOT_MEASURED') {
      overallCompliance = false;
      violations.push({ paramName: 'salt', paramNameRu: 'Массовая доля соли', ...check });
    }
  }

  // КМАФАнМ
  if (measuredValues.kmafanm !== undefined && physChem.kmafanm) {
    const check = compareWithStandard('kmafanm', measuredValues.kmafanm, physChem.kmafanm);
    parameterChecks.kmafanm = {
      paramNameRu: 'КМАФАнМ',
      unit: 'КОЕ/г',
      gostRef: standards.tr_ts,
      ...check
    };
    if (check.status !== 'COMPLIANT' && check.status !== 'NOT_MEASURED') {
      overallCompliance = false;
      violations.push({ paramName: 'kmafanm', paramNameRu: 'КМАФАнМ', ...check,
        deviationKey: 'kmafanm_high' });
    }
  }

  // ── Шаг 2: Органолептика ────────────────────────────────────────────────────
  const organolepticsAssessment = assessOrganoleptics(measuredValues.organoleptic);
  if (organolepticsAssessment && !organolepticsAssessment.isCompliant) {
    overallCompliance = false;
    violations.push({
      paramName: 'organoleptic',
      paramNameRu: 'Органолептические показатели',
      status: 'NON_COMPLIANT',
      measuredValue: organolepticsAssessment.averageScore,
      complianceText: `✗ Органолептика неудовлетворительная (средний балл: ${organolepticsAssessment.averageScore})`
    });
  }

  // ── Шаг 3: Анализ нарушений и ХАССП ─────────────────────────────────────────
  const violationDetails = violations.map(v => {
    const devInfo = v.deviationKey ? DEVIATION_RECOMMENDATIONS[v.deviationKey] : null;
    return {
      ...v,
      defectInfo: devInfo || {
        defectName: v.paramNameRu + ' — несоответствие',
        possibleCauses: ['Требуется детальное расследование'],
        recommendations: ['Провести дополнительные анализы для установления причины.'],
        riskLevel: 'СРЕДНИЙ',
        disposition: 'Продукт задержан до выяснения обстоятельств.'
      }
    };
  });

  // ── Шаг 4: ХАССП-анализ по выявленным нарушениям ────────────────────────────
  let haccpReport = null;
  if (violations.length > 0) {
    haccpReport = generateHACCPReport({
      product,
      productGroup: product.group || 'general',
      violations: violationDetails,
      haccpDb
    });
  }

  // ── Шаг 5: Формирование итогового статуса ────────────────────────────────────
  const overallStatus = overallCompliance ? 'СООТВЕТСТВУЕТ' : 'НЕ СООТВЕТСТВУЕТ';
  const statusDetails = overallCompliance
    ? `Продукт "${product.name}" СООТВЕТСТВУЕТ требованиям ${standards.gost || 'действующих нормативных документов'} по всем проверенным показателям.`
    : `Продукт "${product.name}" НЕ СООТВЕТСТВУЕТ требованиям ${standards.gost || 'нормативных документов'} по следующим показателям: ${violations.map(v => v.paramNameRu).join(', ')}.`;

  // ── Шаг 6: Условия хранения при наличии ──────────────────────────────────────
  let storageAnalysis = null;
  if (storageConditions) {
    const tempViolations = [];
    const norms = product.storageConditions || {};
    if (norms.maxTemp !== undefined && storageConditions.temperature > norms.maxTemp) {
      tempViolations.push(`Температура хранения ${storageConditions.temperature}°C превышает нормативную (не более ${norms.maxTemp}°C).`);
    }
    if (norms.maxRH !== undefined && storageConditions.humidity > norms.maxRH) {
      tempViolations.push(`ОВВ ${storageConditions.humidity}% превышает нормативную (не более ${norms.maxRH}%).`);
    }
    storageAnalysis = {
      providedConditions: storageConditions,
      normativeConditions: norms,
      violations: tempViolations,
      compliant: tempViolations.length === 0
    };
  }

  // ── Финальный документ ────────────────────────────────────────────────────────
  return {
    conclusionNumber,
    timestamp,
    documentTitle: 'ЭКСПЕРТНОЕ ЗАКЛЮЧЕНИЕ о соответствии продукции требованиям нормативных документов',
    sampleInformation: {
      productName: product.name,
      batchNumber: sampleInfo.batchNumber || 'Не указан',
      manufacturer: sampleInfo.manufacturer || 'Не указан',
      samplingDate: sampleInfo.samplingDate || 'Не указана',
      labNumber: sampleInfo.labNumber || conclusionNumber,
      analysisDate: new Date().toLocaleDateString('ru-RU')
    },
    regulatoryBasis: {
      gost: standards.gost || 'Не указан',
      gostTitle: standards.gostTitle || '',
      tr_ts: standards.tr_ts || 'Не указан',
      tr_tsTitle: standards.tr_tsTitle || ''
    },
    physicalChemicalAnalysis: parameterChecks,
    organolepticsAnalysis: organolepticsAssessment,
    storageConditionsAnalysis: storageAnalysis,
    violations: violationDetails,
    totalViolationsCount: violations.length,
    overallStatus,
    statusDetails,
    haccpRiskAnalysis: haccpReport,
    finalVerdict: {
      status: overallStatus,
      statusCode: overallCompliance ? 'PASS' : 'FAIL',
      recommendation: overallCompliance
        ? 'Допускается к реализации потребителям. Нарушений не выявлено.'
        : `Реализация ЗАПРЕЩЕНА. ${violationDetails.map(v => v.defectInfo?.disposition || '').filter(Boolean).join(' ')}`
    },
    expertSignature: {
      position: 'Эксперт-технолог (автоматизированная система экспертизы)',
      system: 'Научно-образовательный комплекс: Лаборатория продовольственной безопасности v1.0.0',
      mode: 'Автономный режим — все вычисления локальные, без использования внешних API'
    }
  };
}

module.exports = {
  generateConclusion,
  generateHACCPReport,
  getCriticalControlPoints,
  compareWithStandard,
  DEVIATION_RECOMMENDATIONS,
  BUILTIN_HACCP_CCPs
};