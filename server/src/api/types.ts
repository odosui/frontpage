export type Article = {
  title: string;
  url: string;
  image: string;
  new?: boolean;
};

export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  url: string;
  items?: Article[];
};
