import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentService, DashboardStats } from '../../services/payment.service';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  stats: DashboardStats | null = null;
  loading = true;
  error = '';

  constructor(
    private paymentService: PaymentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadDashboardData();
  }

  loadDashboardData() {
    this.loading = true;
    this.error = '';
    this.paymentService.getStats().subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load dashboard statistics.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getPendingPercentage(): number {
    if (!this.stats || !this.stats.total_invoices) return 0;
    return (this.stats.pending_invoices / this.stats.total_invoices) * 100;
  }

  getApprovedPercentage(): number {
    if (!this.stats || !this.stats.total_invoices) return 0;
    return (this.stats.approved_invoices / this.stats.total_invoices) * 100;
  }

  getCompletedPercentage(): number {
    if (!this.stats || !this.stats.total_invoices) return 0;
    return (this.stats.completed_invoices / this.stats.total_invoices) * 100;
  }

  getCancelledPercentage(): number {
    if (!this.stats || !this.stats.total_invoices) return 0;
    return (this.stats.cancelled_invoices / this.stats.total_invoices) * 100;
  }
}
