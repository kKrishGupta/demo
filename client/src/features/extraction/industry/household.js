/**
 * Household Operations & Domestic Facilities Industry Pack
 * Milk delivery, grocery procurement, domestic cleaning, water filter servicing, vendor coordination.
 */

export const HOUSEHOLD_ACTIONS = [
  {
    id: 'act_house_bring_milk',
    canonical: 'Bring milk',
    actionVerb: 'bring',
    object: 'milk',
    industry: 'household',
    category: 'errands',
    keywords: [
      'bring milk', 'bringing milk', 'fetch milk', 'get milk', 'pick up milk', 'milk delivery',
      'milk lana', 'milk laana', 'milk lana hai', 'milk le aana', 'milk le aao', 'milk leke aana',
      'doodh lana', 'doodh laana', 'doodh le aao', 'doodh le aana', 'doodh leke aana',
      'doodh mangwa do', 'doodh rakh de', 'doodh laane',
      'dudh lana', 'dudh laana', 'dudh le aana', 'dudh leke aana',
      'दूध लाना', 'दूध लेकर आना', 'दूध लेके आना', 'दूध ले आना', 'दूध ले आओ', 'दूध मंगवा दो', 'दूध लाओ'
    ],
    isSafetyCritical: false,
    confidence: 0.98
  },
  {
    id: 'act_house_bring_groceries',
    canonical: 'Bring groceries',
    actionVerb: 'bring',
    object: 'groceries',
    industry: 'household',
    category: 'errands',
    keywords: [
      'bring groceries', 'fetch groceries', 'get groceries', 'buy vegetables',
      'sabzi lana', 'sabji laana', 'rashan lana', 'rashan le aana', 'kirana lana',
      'सब्जी लाना', 'राशन लाना'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_house_water_filter_service',
    canonical: 'Service RO drinking water purifier',
    actionVerb: 'service',
    object: 'RO water purifier',
    industry: 'household',
    category: 'maintenance',
    keywords: [
      'service water filter', 'change ro filter cartridge', 'clean ro purifier',
      'water filter check karwana', 'ro service karwa do',
      'आरओ वाटर फिल्टर सर्विस'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  },
  {
    id: 'act_house_clean_kitchen',
    canonical: 'Clean kitchen',
    actionVerb: 'clean',
    object: 'kitchen',
    industry: 'household',
    category: 'cleaning',
    keywords: [
      'clean kitchen', 'clean the kitchen', 'kitchen cleaning', 'wipe kitchen counters',
      'kitchen saaf karo', 'kitchen saaf karna', 'kitchen saaf karegi', 'rasoi ki safai',
      'किचन साफ करो', 'रसोई साफ करो'
    ],
    isSafetyCritical: false,
    confidence: 0.95
  }
];
