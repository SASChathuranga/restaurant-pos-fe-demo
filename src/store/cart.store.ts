import { create } from "zustand";

type CartItem = {
  _id: string;
  name: string;
  /** Effective (post-discount) unit price used for totals */
  price: number;
  /** Original price before any product-level discount; equals price when no discount */
  originalPrice?: number;
  taxRate?: number;
  quantity: number;
};

interface CartState {
  items: CartItem[];
  addItem: (product: Omit<CartItem, "quantity">) => void;
  increaseQty: (id: string) => void;
  decreaseQty: (id: string) => void;
  setQty: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  subtotal: () => number;
  taxTotal: () => number;
  grandTotal: () => number;
  /** Total product-level discount saved (originalPrice - price) across all items */
  productDiscountTotal: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  addItem: (product) => {
    const items = get().items;
    const existing = items.find((item) => item._id === product._id);

    if (existing) {
      set({
        items: items.map((item) =>
          item._id === product._id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      });
    } else {
      set({
        items: [...items, { ...product, quantity: 1 }]
      });
    }
  },

  increaseQty: (id) => {
    set({
      items: get().items.map((item) =>
        item._id === id ? { ...item, quantity: item.quantity + 1 } : item
      )
    });
  },

  decreaseQty: (id) => {
    const updated = get()
      .items.map((item) =>
        item._id === id ? { ...item, quantity: item.quantity - 1 } : item
      )
      .filter((item) => item.quantity > 0);

    set({ items: updated });
  },

  setQty: (id, quantity) => {
    const q = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
    const updated = get()
      .items.map((item) => (item._id === id ? { ...item, quantity: q } : item))
      .filter((item) => item.quantity > 0);

    set({ items: updated });
  },

  removeItem: (id) => {
    set({
      items: get().items.filter((item) => item._id !== id)
    });
  },

  clearCart: () => set({ items: [] }),

  subtotal: () =>
    get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),

  taxTotal: () =>
    get().items.reduce((sum, item) => {
      const line = item.price * item.quantity;
      const tax = line * ((item.taxRate || 0) / 100);
      return sum + tax;
    }, 0),

  grandTotal: () => get().subtotal() + get().taxTotal(),

  productDiscountTotal: () =>
    get().items.reduce((sum, item) => {
      const orig = item.originalPrice ?? item.price;
      return sum + (orig - item.price) * item.quantity;
    }, 0),
}));