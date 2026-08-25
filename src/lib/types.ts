export type Account = {
  id: string;
  name: string;
  balance: number;
  active?: boolean;
  primary?: boolean;
};

export type Movement = {
  id: string;
  name: string;
  date: string;
  type: "Ingreso" | "Egreso" | "Deuda" | "Ajuste";
  subtype: string;
  amount: number;
  account?: string;
  category?: string;
  debtor?: string;
  description?: string;
  review?: string;
  scope?: string;
};

export type Debtor = {
  id: string;
  name: string;
  balance: number;
  status: string;
  active?: boolean;
};

export type Category = { id: string; name: string; type?: string; active?: boolean };
