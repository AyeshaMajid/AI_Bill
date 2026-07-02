import type { NextApiRequest, NextApiResponse } from 'next'

// Static, season-aware energy-saving tips — no AI call needed, so this never
// hits any API quota and always responds instantly.
type Tip = {
  icon: string
  title: string
  desc: string
  saving: string
}

const summerTips: Tip[] = [
  { icon: '❄️', title: 'Optimize AC Usage', desc: 'Set your AC to 26°C. Every degree lower increases energy consumption by 6%.', saving: '10-20%' },
  { icon: '💡', title: 'Switch to LED Bulbs', desc: 'Replace traditional bulbs with LEDs. They use 75% less energy.', saving: '5-15%' },
  { icon: '🌬️', title: 'Use Ceiling Fans', desc: 'Use fans with ACs. It allows you to set the AC temperature higher.', saving: '5-10%' },
  { icon: '🧊', title: 'Fridge Efficiency', desc: "Don't open the fridge door frequently. Let hot food cool down first.", saving: '3-8%' },
  { icon: '🧺', title: 'Full Load Washing', desc: 'Run your washing machine only when it is fully loaded.', saving: '2-5%' },
  { icon: '🖥️', title: 'Unplug Electronics', desc: "Devices on standby consume 'phantom load'. Unplug chargers when not in use.", saving: '3-6%' },
  { icon: '🪟', title: 'Block Sunlight', desc: 'Use curtains or blinds to block direct sunlight from heating your rooms.', saving: '5-10%' },
  { icon: '⚙️', title: 'Clean AC Filters', desc: 'A dirty filter makes the AC work harder, consuming more power.', saving: '5-15%' },
]

const winterTips: Tip[] = [
  { icon: '🔥', title: 'Optimize Geyser', desc: "Set geyser thermostat to 45-50°C. Don't leave it on for hours.", saving: '15-25%' },
  { icon: '🧥', title: 'Layer Up', desc: 'Wear warm clothes instead of running electric heaters all day.', saving: '20-40%' },
  { icon: '☕', title: 'Use Thermo Flasks', desc: 'Boil water once and store it in a flask instead of reheating.', saving: '2-5%' },
  { icon: '🪟', title: 'Seal Windows', desc: 'Prevent cold drafts by using weather stripping on doors and windows.', saving: '5-10%' },
  { icon: '☀️', title: 'Use Sunlight', desc: 'Open curtains during the day to let natural sunlight heat your rooms.', saving: '5-10%' },
  { icon: '🔌', title: 'Timer on Heaters', desc: 'Use a timer on heaters so they turn off automatically when you sleep.', saving: '15-30%' },
  { icon: '🛏️', title: 'Electric Blankets', desc: 'Use an electric blanket instead of heating the whole room.', saving: '10-20%' },
  { icon: '🚿', title: 'Shorter Showers', desc: 'Reduce shower time. Less hot water means less work for the geyser.', saving: '3-8%' },
]

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const currentMonth = new Date().getMonth()
  const isSummer = currentMonth >= 3 && currentMonth <= 8
  const activeTipsArray: Tip[] = isSummer ? summerTips : winterTips
  const seasonHeading: string = isSummer ? '☀️ Summer Energy Savers' : '❄️ Winter Energy Savers'

  const shuffled = [...activeTipsArray].sort(() => 0.5 - Math.random())
  const selectedTips = shuffled.slice(0, 6)

  res.status(200).json({
    success: true,
    season: seasonHeading,
    tips: selectedTips,
  })
}
