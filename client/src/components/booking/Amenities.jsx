import { Bath, Bike, Briefcase, Car, Check, Coffee, Dumbbell, Flame, Library, Mountain, Snowflake, Sun, Trees, Tv, UtensilsCrossed, Waves, Wifi, Wind } from 'lucide-react';

const RULES = [
  [/wi-?fi/i, Wifi],
  [/pool|beach|sea|lake|ocean|harbour/i, Waves],
  [/mountain|valley/i, Mountain],
  [/forest|garden/i, Trees],
  [/air cond/i, Snowflake],
  [/tea|coffee|caf/i, Coffee],
  [/restaurant|kitchen|dham|room service/i, UtensilsCrossed],
  [/bath|shower|tub/i, Bath],
  [/gym/i, Dumbbell],
  [/tv/i, Tv],
  [/fire|heater/i, Flame],
  [/parking|transfer/i, Car],
  [/bicycle|bike/i, Bike],
  [/business|desk|lounge/i, Briefcase],
  [/library/i, Library],
  [/balcony|patio|terrace/i, Sun],
  [/spa|yoga/i, Wind],
];

export function amenityIcon(name) {
  return RULES.find(([rx]) => rx.test(name))?.[1] ?? Check;
}

export default function Amenities({ items = [], limit }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="amenity-list">
      {shown.map((a) => {
        const Icon = amenityIcon(a);
        return (
          <li key={a}>
            <Icon size={15} strokeWidth={1.7} className="text-brass" aria-hidden="true" />
            {a}
          </li>
        );
      })}
      {limit && items.length > limit && <li>+{items.length - limit} more</li>}
    </ul>
  );
}
