import type { ImageSourcePropType } from 'react-native';
import { HOME_HOLIDAY_THUMBS } from './homeImages';
import { PASSOVER_NOTIFY_INTEREST } from './pilotHolidays';

export type MyBoxesHolidayAction = 'get-started' | 'pre-register';

export type MyBoxesHoliday = {
  id: string;
  name: string;
  dateLabel: string;
  dismissLabel: string;
  image: ImageSourcePropType;
  action: MyBoxesHolidayAction;
  ravPrompt?: string;
  interestKey?: string;
};

export const MY_BOXES_HOLIDAYS: MyBoxesHoliday[] = [
  {
    id: 'hanukkah-2026',
    name: 'Hanukkah',
    dateLabel: 'Dec 4–12, 2026',
    dismissLabel: 'Hanukkah 2026',
    image: HOME_HOLIDAY_THUMBS.hanukkah,
    action: 'get-started',
  },
  {
    id: 'passover-2027',
    name: 'Passover',
    dateLabel: 'Apr 21–29, 2027',
    dismissLabel: 'Passover 2027',
    image: HOME_HOLIDAY_THUMBS.passover,
    action: 'pre-register',
    ravPrompt: "I'd like to start thinking about Passover",
    interestKey: PASSOVER_NOTIFY_INTEREST,
  },
  {
    id: 'high-holidays-sukkot-2027',
    name: 'High Holidays + Sukkot',
    dateLabel: 'Oct 2–23, 2027',
    dismissLabel: 'High Holidays + Sukkot 2027',
    image: HOME_HOLIDAY_THUMBS.highHolidays,
    action: 'pre-register',
    ravPrompt: "I'd like to start thinking about the High Holidays and Sukkot",
    interestKey: 'high-holidays-sukkot-2027',
  },
  {
    id: 'purim-2028',
    name: 'Purim',
    dateLabel: 'Mar 23–24, 2028',
    dismissLabel: 'Purim 2028',
    image: HOME_HOLIDAY_THUMBS.purim,
    action: 'pre-register',
    ravPrompt: "I'd like to start thinking about Purim",
    interestKey: 'purim-2028',
  },
];
