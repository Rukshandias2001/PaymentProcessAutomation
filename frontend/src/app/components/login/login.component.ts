import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PaymentService } from '../../services/payment.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';

  demoAccounts = [
    { label: 'EA / Manager (Approver 1)', username: 'manager', description: 'Register, correct, and cancel payments' },
    { label: 'Senior Manager (Approver 2)', username: 'seniormanager', description: 'Approve or Reject (routes back to Manager)' },
    { label: 'Head of IT (Approver 3)', username: 'headofit', description: 'Approve or Reject (routes back to Manager)' },
    { label: 'DGM Operations (Approver 4)', username: 'dgm', description: 'Approve or Reject (routes back to Manager)' },
    { label: 'Central Accounts (Approver 5)', username: 'accounts', description: 'Disburse / Mark as Paid or Reject' }
  ];

  constructor(
    private paymentService: PaymentService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  onSubmit() {
    if (!this.username || !this.password) {
      this.error = 'Please enter username and password.';
      return;
    }

    this.loading = true;
    this.error = '';

    this.paymentService.login(this.username, this.password).subscribe({
      next: (res) => {
        this.loading = false;
        this.router.navigate(['/']);
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.detail || 'Invalid username or password.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  quickLogin(username: string) {
    this.username = username;
    this.password = 'password';
    this.onSubmit();
  }
}
