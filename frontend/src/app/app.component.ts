import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SimulationService } from './services/simulation.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  constructor(public simService: SimulationService) {}

  roles = [
    { code: 'PM', name: 'Project Manager', icon: '👤' },
    { code: 'TL', name: 'Technical Lead', icon: '🛠️' },
    { code: 'FC', name: 'Financial Controller', icon: '📊' },
    { code: 'FD', name: 'Finance Director', icon: '🏛️' }
  ];

  changeRole(roleCode: string) {
    this.simService.setRole(roleCode);
  }
}
