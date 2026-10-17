import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from './store/useStore';
import { Header, Sidebar, Toaster } from './components/layout/Shell';
import { MonthDetail } from './components/data/MonthDetail';
import { PlaybackClock } from './lib/live';
import { Overview } from './pages/Overview';
import { Social } from './pages/Social';
import { Sales } from './pages/Sales';
import { Traffic } from './pages/Traffic';
import { Roi } from './pages/Roi';
import { Compare } from './pages/Compare';
import { Insights } from './pages/Insights';
import { DataAdmin } from './pages/DataAdmin';

const PAGES = {
  overview: Overview,
  social: Social,
  sales: Sales,
  traffic: Traffic,
  roi: Roi,
  compare: Compare,
  insights: Insights,
  data: DataAdmin,
};

export default function App() {
  const page = useStore((s) => s.page);
  const scope = useStore((s) => s.scope);
  const Page = PAGES[page];
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-3 pb-16 pt-6 sm:px-5 lg:px-8" style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom))' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${page}-${scope}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <PlaybackClock />
      <MonthDetail />
      <Toaster />
    </div>
  );
}
