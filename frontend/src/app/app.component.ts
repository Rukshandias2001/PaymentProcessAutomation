import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SimulationService } from './services/simulation.service';
import { PaymentService } from './services/payment.service';
import { LoginComponent } from './components/login/login.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, LoginComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  constructor(
    public simService: SimulationService,
    public paymentService: PaymentService
  ) {}

  roles = [
    { code: 'PM', name: 'Project Manager', icon: '👤' },
    { code: 'TL', name: 'Technical Lead', icon: '🛠️' },
    { code: 'FC', name: 'Financial Controller', icon: '📊' },
    { code: 'FD', name: 'Finance Director', icon: '🏛️' }
  ];

  changeRole(roleCode: string) {
    this.simService.setRole(roleCode);
  }

  logout() {
    this.paymentService.logout().subscribe();
  }
}
