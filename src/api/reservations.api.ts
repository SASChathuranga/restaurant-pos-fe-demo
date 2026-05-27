import api from './axios';
import type { Reservation, ReservationFormData, ReservationStatus } from '../types';

export const reservationsApi = {
  // Get all reservations with optional filters
  getAll: (params?: { status?: ReservationStatus; date?: string }) => 
    api.get<{ reservations: Reservation[] }>('/reservations', { params }).then(res => res.data.reservations),

  // Get reservation by ID
  getById: (id: string) =>
    api.get<{ reservation: Reservation }>(`/reservations/${id}`).then(res => res.data.reservation),

  // Create a new reservation
  create: (data: ReservationFormData) => 
    api.post<{ reservation: Reservation }>('/reservations', data).then(res => res.data.reservation),

  // Update reservation (full update)
  update: (id: string, data: Partial<ReservationFormData>) =>
    api.put<{ reservation: Reservation }>(`/reservations/${id}`, data).then(res => res.data.reservation),

  // Delete/cancel reservation
  delete: (id: string) => api.delete(`/reservations/${id}`),

  // Update reservation status
  updateStatus: (id: string, status: ReservationStatus) =>
    api.patch<{ reservation: Reservation }>(`/reservations/${id}/status`, { status }).then(res => res.data.reservation),

  // Seat a reservation
  seat: (id: string) =>
    api.post<{ reservation: Reservation }>(`/reservations/${id}/seat`).then(res => res.data.reservation),
};
