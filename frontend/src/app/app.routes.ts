import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { InvoiceListComponent } from './components/invoice-list/invoice-list.component';
import { InvoiceFormComponent } from './components/invoice-form/invoice-form.component';
import { CertListComponent } from './components/cert-list/cert-list.component';
import { CertDetailComponent } from './components/cert-detail/cert-detail.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'invoices', component: InvoiceListComponent },
  { path: 'invoices/new', component: InvoiceFormComponent },
  { path: 'invoices/edit/:id', component: InvoiceFormComponent },
  { path: 'certificates', component: CertListComponent },
  { path: 'certificates/new/:itd_no', component: CertDetailComponent },  // Create screen
  { path: 'certificates/view/:id', component: CertDetailComponent },     // View & approve screen
  { path: '**', redirectTo: 'dashboard' }
];
