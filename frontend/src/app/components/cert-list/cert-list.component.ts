import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PaymentService, PaymentCertificate } from '../../services/payment.service';

@Component({
  selector: 'app-cert-list',
  imports: [CommonModule, RouterLink],
  templateUrl: './cert-list.component.html',
  styleUrl: './cert-list.component.css'
})
export class CertListComponent implements OnInit {
  certificates: PaymentCertificate[] = [];
  loading = true;
  error = '';

  constructor(private paymentService: PaymentService) {}

  ngOnInit() {
    this.loadCertificates();
  }

  loadCertificates() {
    this.loading = true;
    this.paymentService.getCertificates().subscribe({
      next: (data) => {
        this.certificates = data;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load payment certificates.';
        this.loading = false;
      }
    });
  }
}
