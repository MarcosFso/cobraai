import { CustomerForm } from './components/CustomerForm';
import { InvoiceForm } from './components/InvoiceForm';
import { InvoiceList } from './components/InvoiceList';
import { MonthlyChart } from './components/MonthlyChart';
import { SummaryCards } from './components/SummaryCards';

export function App() {
  return (
    <main>
      <h1>Plataforma de Cobranças</h1>
      <SummaryCards />
      <MonthlyChart />
      <InvoiceList />
      <div className="forms">
        <CustomerForm />
        <InvoiceForm />
      </div>
    </main>
  );
}
