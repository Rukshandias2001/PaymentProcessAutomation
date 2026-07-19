import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SimulationService {
  currentRole = signal<string>('PM'); // Default to Project Manager

  setRole(role: string) {
    this.currentRole.set(role);
  }
}
