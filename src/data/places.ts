export type Place = {
  id: string;
  name: string;
  category: string;
  coordinates: [number, number];
};

export const places: Place[] = [
  {
    id: "jec-campus",
    name: "Jorhat Engineering College",
    category: "Campus",
    coordinates: [94.2506399, 26.7458283],
  },

  {
    id: "cse-department",
    name: "Computer Science & Engineering Department",
    category: "Academic",

    // Replace these two numbers with the coordinates
    // you get by clicking the actual CSE building.
    coordinates: [94.2506399, 26.7458283],
  },
];