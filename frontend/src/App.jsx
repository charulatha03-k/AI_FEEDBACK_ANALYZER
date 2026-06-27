import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiGrid, FiActivity, FiDatabase, FiSmile, 
  FiCpu, FiDownload, FiSearch, 
  FiSun, FiMoon, FiBell, FiUser, FiCalendar, FiRefreshCw, 
  FiAlertTriangle, FiCheckCircle, FiInbox, FiStar, FiUploadCloud, 
  FiPlusCircle, FiChevronDown, FiChevronUp, FiInfo,
  FiServer, FiClock, FiZap, FiXCircle, FiFilter
} from 'react-icons/fi';
import { exportInsightsPdf } from './utils/exportInsightsPdf';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, 
  CartesianGrid, PieChart, Pie, Cell, Legend, BarChart, Bar, LineChart, Line 
} from 'recharts';
import './App.css';

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const AI_FETCH_TIMEOUT_MS = 120000;

// Custom Animated Counter Hook/Component — memoized to avoid re-renders on parent state changes
const AnimatedCounter = React.memo(({ value, duration = 800 }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = parseFloat(value);
    if (isNaN(end)) {
      setCount(value);
      return;
    }
    if (end === 0) {
      setCount(0);
      return;
    }
    const isInt = Number.isInteger(end);
    const steps = 30;
    const increment = end / steps;
    const stepTime = duration / steps;
    let timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(isInt ? Math.floor(start) : parseFloat(start.toFixed(1)));
      }
    }, stepTime);
    return () => clearInterval(timer);
  }, [value, duration]);

  if (typeof count === 'number') {
    if (Number.isInteger(count)) {
      return count.toLocaleString();
    }
    return count;
  }
  return count;
});

// Mini Sparkline component using Recharts — memoized to avoid re-renders on unrelated state changes
const Sparkline = React.memo(({ data, strokeColor }) => {
  if (!data || data.length === 0) return null;
  const chartData = data.map((val, i) => ({ id: i, val }));
  return (
    <div className="h-8 w-20 sparkline-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line 
            type="monotone" 
            dataKey="val" 
            stroke={strokeColor} 
            strokeWidth={1.5} 
            dot={false} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
});

export default function App() {
  // Navigation tabs
  const tabs = [
    { id: 'dashboard', name: 'Dashboard', icon: <FiGrid className="w-5 h-5" /> },
    { id: 'realtime', name: 'Real-Time Reviews', icon: <FiActivity className="w-5 h-5" /> },
    { id: 'database', name: 'Reviews Database', icon: <FiDatabase className="w-5 h-5" /> },
    { id: 'sentiment', name: 'Sentiment Analysis', icon: <FiSmile className="w-5 h-5" /> },
    { id: 'category', name: 'Category Analysis', icon: <FiFilter className="w-5 h-5" /> },
    { id: 'summary', name: 'AI Insights', icon: <FiZap className="w-5 h-5" /> },
    { id: 'systemlogs', name: 'System Logs', icon: <FiServer className="w-5 h-5" /> },
  ];

  // Core App States
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [theme, setTheme] = useState('dark');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Dashboard & Trend Data States
  const [metrics, setMetrics] = useState({
    total_reviews: 0,
    avg_rating: 0,
    positive_pct: 0,
    negative_pct: 0,
    neutral_pct: 0,
    reviews_today: 0,
    reviews_sparkline: [],
    rating_sparkline: [],
    total_reviews_change: "+0%",
    avg_rating_change: "+0",
    positive_pct_change: "+0%",
    negative_pct_change: "-0%",
    reviews_today_change: "+0%"
  });
  
  const [trends, setTrends] = useState({
    sentiment_trend: [],
    category_distribution: [],
    rating_distribution: [],
    source_distribution: [],
    category_sentiment: []
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Notifications state
  const [notifications, setNotifications] = useState([
    { id: 1, text: "System seeded with demo reviews.", time: "Just now", read: false },
    { id: 2, text: "AI Recommendations generated.", time: "5m ago", read: false }
  ]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Database Tab States
  const [dbReviews, setDbReviews] = useState([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbPages, setDbPages] = useState(1);
  const [dbPage, setDbPage] = useState(1);
  const [dbSearch, setDbSearch] = useState('');
  const [dbRating, setDbRating] = useState('');
  const [dbSentiment, setDbSentiment] = useState('');
  const [dbCategory, setDbCategory] = useState('');
  const [dbSource, setDbSource] = useState('');
  const [dbDateFilter, setDbDateFilter] = useState('');
  const [dbStartDate, setDbStartDate] = useState('');
  const [dbEndDate, setDbEndDate] = useState('');
  const [dbSortBy, setDbSortBy] = useState('created_at');
  const [dbSortOrder, setDbSortOrder] = useState('DESC');
  const [dbLoading, setDbLoading] = useState(false);

  // AI Summary States
  const [aiSummary, setAiSummary] = useState({ overall_summary: '' });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Recommendation Engine States
  const [aiRecs, setAiRecs] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // AI Error States
  const [summaryError, setSummaryError] = useState(null);
  const [recsError, setRecsError] = useState(null);
  const [summarySuccess, setSummarySuccess] = useState(false);
  const [recsSuccess, setRecsSuccess] = useState(false);

  // Scrapers / Upload States
  const [uploadLoading, setUploadLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [fetchStatus, setFetchStatus] = useState(null);
  const [appId, setAppId] = useState('all');
  const [fetchCount, setFetchCount] = useState(20);
  const [availableApps, setAvailableApps] = useState([]);

  const [playstoreUrl, setPlaystoreUrl] = useState('');
  const [extractedPlaystoreAppId, setExtractedPlaystoreAppId] = useState('');
  const [playstoreUrlError, setPlaystoreUrlError] = useState(null);
  const [playstoreFetchEnabled, setPlaystoreFetchEnabled] = useState(false);
  const [playstoreFetchStep, setPlaystoreFetchStep] = useState('idle');
  const [playstoreReviewList, setPlaystoreReviewList] = useState([]);
  const [playstoreSummary, setPlaystoreSummary] = useState('');
  const [playstoreInsights, setPlaystoreInsights] = useState([]);

  // System Logs / Monitoring States
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsStats, setLogsStats] = useState({
    total_requests: 0,
    successful: 0,
    failed: 0,
    success_rate: 0,
    avg_response_time_ms: 0,
  });
  const [logsRequests, setLogsRequests] = useState([]);
  const [logsErrors, setLogsErrors] = useState([]);
  const [logsTimeline, setLogsTimeline] = useState([]);
  const [logsEndpoints, setLogsEndpoints] = useState([]);
  const [logsSlowest, setLogsSlowest] = useState([]);
  const [logsEndpointList, setLogsEndpointList] = useState([]);
  const [logsDateFilter, setLogsDateFilter] = useState('');
  const [logsEndpointFilter, setLogsEndpointFilter] = useState('');
  const [logsStatusFilter, setLogsStatusFilter] = useState('');
  const [expandedError, setExpandedError] = useState(null);

  // Guard: ensures dashboard data is only loaded once on mount
  const dashboardLoadedRef = useRef(false);

  const extractPlayStoreAppId = (url) => {
    try {
      const parsed = new URL(url.trim());
      const allowed = ['play.google.com', 'www.play.google.com'];
      if (!allowed.includes(parsed.hostname)) return null;
      const id = parsed.searchParams.get('id');
      return id && id.trim() ? id.trim() : null;
    } catch (err) {
      return null;
    }
  };

  useEffect(() => {
    if (!playstoreUrl) {
      setExtractedPlaystoreAppId('');
      setPlaystoreFetchEnabled(false);
      setPlaystoreUrlError(null);
      return;
    }

    const extracted = extractPlayStoreAppId(playstoreUrl);
    if (extracted) {
      setExtractedPlaystoreAppId(extracted);
      setPlaystoreUrlError(null);
      setPlaystoreFetchEnabled(true);
    } else {
      setExtractedPlaystoreAppId('');
      setPlaystoreFetchEnabled(false);
      setPlaystoreUrlError('Please enter a valid Play Store URL');
    }
  }, [playstoreUrl]);

  // refreshDashboard — declared before any useEffect so the closure reference is valid.
  // Wrapped in useCallback so its reference is stable across renders.
  // Only called on: Initial Load | Manual Refresh | Reviews Imported.
  // The 30-second auto-poll has been removed — it was the root cause of repeated requests.
  const refreshDashboard = useCallback(async (isSilent = false, reason = 'Manual Refresh') => {
    console.log(`[Dashboard] Refresh triggered. Reason: "${reason}" | Silent: ${isSilent}`);
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const query = appId && appId !== 'all' ? `?app_id=${encodeURIComponent(appId)}` : '';
      const [resMetrics, resTrends] = await Promise.all([
        fetch(`${API_BASE}/api/metrics${query}`),
        fetch(`${API_BASE}/api/trends${query}`)
      ]);

      const [dataMetrics, dataTrends] = await Promise.all([
        resMetrics.json(),
        resTrends.json()
      ]);

      setMetrics(dataMetrics);
      setTrends(dataTrends);
    } catch (err) {
      console.error('[Dashboard] Refresh error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // API_BASE is a module-level constant, no reactive deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  // 1. Clock effect
  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clock);
  }, []);

  // 2. Load available apps and theme from storage
  useEffect(() => {
    const loadApps = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/apps`);
        const data = await res.json();
        const apps = data.apps || [];
        setAvailableApps(apps);
        if (!appId || appId === 'all') {
          return;
        }
        if (!apps.some((item) => item.app_id === appId)) {
          setAppId('all');
        }
      } catch (err) {
        console.error('Load apps error:', err);
      }
    };

    loadApps();

    const localTheme = localStorage.getItem('theme');
    if (localTheme) {
      setTheme(localTheme);
    }
  }, []);

  // Apply dark mode class to html
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 3. Initial dashboard load — fires exactly once on mount, guarded by ref
  useEffect(() => {
    if (!dashboardLoadedRef.current) {
      dashboardLoadedRef.current = true;
      refreshDashboard(false, 'Initial Load');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload reviews list whenever filtering or sorting state changes
  useEffect(() => {
    if (currentTab === 'database') {
      fetchReviews();
    }
  }, [dbPage, dbRating, dbSentiment, dbCategory, dbSource, dbSortBy, dbSortOrder, currentTab, appId]);

  // Load AI views on tab switch
  useEffect(() => {
    if (currentTab === 'systemlogs') {
      fetchSystemLogs();
    }
  }, [currentTab]);

  // Reload logs when filters change
  useEffect(() => {
    if (currentTab === 'systemlogs') {
      fetchSystemLogs(true);
    }
  }, [logsDateFilter, logsEndpointFilter, logsStatusFilter]);

  const fetchReviews = async () => {
    setDbLoading(true);
    try {
      const params = new URLSearchParams({
        page: dbPage,
        page_size: 10,
        sort_by: dbSortBy,
        sort_order: dbSortOrder
      });
      if (appId && appId !== 'all') params.append('app_id', appId);
      if (dbSearch) params.append('search', dbSearch);
      if (dbRating) params.append('rating', dbRating);
      if (dbSentiment) params.append('sentiment', dbSentiment);
      if (dbCategory) params.append('category', dbCategory);
      if (dbSource) params.append('source', dbSource);

      let computedStart = '';
      let computedEnd = '';
      const today = new Date();
      if (dbDateFilter === 'today') {
        computedStart = today.toISOString().split('T')[0];
        computedEnd = computedStart;
      } else if (dbDateFilter === '7days') {
        const past = new Date();
        past.setDate(today.getDate() - 7);
        computedStart = past.toISOString().split('T')[0];
        computedEnd = today.toISOString().split('T')[0];
      } else if (dbDateFilter === '30days') {
        const past = new Date();
        past.setDate(today.getDate() - 30);
        computedStart = past.toISOString().split('T')[0];
        computedEnd = today.toISOString().split('T')[0];
      } else if (dbDateFilter === 'custom') {
        computedStart = dbStartDate;
        computedEnd = dbEndDate;
      }

      if (computedStart) params.append('start_date', computedStart);
      if (computedEnd) params.append('end_date', computedEnd);

      const res = await fetch(`${API_BASE}/api/reviews?${params.toString()}`);
      const data = await res.json();
      setDbReviews(data.reviews || []);
      setDbTotal(data.total || 0);
      setDbPages(data.total_pages || 1);
    } catch (err) {
      console.error("Fetch reviews error:", err);
    } finally {
      setDbLoading(false);
    }
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = AI_FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  };

  const fetchAISummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummarySuccess(false);
    console.log("Button Clicked: Generate Summary");
    console.log("Request Sent: GET /api/ai/summary");
    const query = appId && appId !== 'all' ? `?app_id=${encodeURIComponent(appId)}` : '';
    const apiUrl = `${API_BASE}/api/ai/summary${query}`;
    console.log("API URL called:", apiUrl);
    try {
      const res = await fetchWithTimeout(apiUrl);
      console.log("Status Code:", res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error Received:", errorText);
        throw new Error(`Server returned ${res.status}: ${errorText}`);
      }
      const data = await res.json();
      console.log("Response Received:", data);
      if (!data || typeof data !== 'object') {
        throw new Error("Invalid response format from server.");
      }
      setAiSummary({
        overall_summary: data.overall_summary || '',
      });
      setSummarySuccess(true);
      addNotification("AI Summary generated successfully.");
      setTimeout(() => setSummarySuccess(false), 3000);
    } catch (err) {
      const message = err.name === 'AbortError'
        ? "Request timed out. The AI service took too long to respond."
        : (err.message || "Please check if the backend service is running.");
      console.error("Error Received:", message);
      setSummaryError(`Failed to generate summary: ${message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleGenerateSummary = () => {
    console.log("Button Clicked");
    fetchAISummary();
  };

  const fetchAIRecommendations = async () => {
    setRecsLoading(true);
    setRecsError(null);
    setRecsSuccess(false);
    console.log("Button Clicked: Generate Recommendations");
    console.log("Recommendation Request Sent: GET /api/ai/recommendations");
    const query = appId && appId !== 'all' ? `?app_id=${encodeURIComponent(appId)}` : '';
    const apiUrl = `${API_BASE}/api/ai/recommendations${query}`;
    console.log("API URL called:", apiUrl);
    try {
      const res = await fetchWithTimeout(apiUrl);
      console.log("Status Code:", res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Error Received:", errorText);
        throw new Error(`Server returned ${res.status}: ${errorText}`);
      }
      const data = await res.json();
      console.log("Recommendation Response Received:", data);
      if (!Array.isArray(data)) {
        throw new Error("Invalid response format — expected an array of recommendations.");
      }
      if (data.length === 0) {
        throw new Error("No recommendations were returned by the AI service.");
      }
      setAiRecs(data);
      setRecsSuccess(true);
      addNotification("AI Recommendations generated successfully.");
      setTimeout(() => setRecsSuccess(false), 3000);
    } catch (err) {
      const message = err.name === 'AbortError'
        ? "Request timed out. The AI service took too long to respond."
        : (err.message || "Please check if the backend service is running.");
      console.error("Error Received:", message);
      setRecsError(`Failed to generate recommendations: ${message}`);
    } finally {
      setRecsLoading(false);
    }
  };

  const handleGenerateRecommendations = () => {
    console.log("Button Clicked");
    fetchAIRecommendations();
  };

  const buildLogsQuery = (extra = {}) => {
    const params = new URLSearchParams();
    if (logsDateFilter) params.append('date_filter', logsDateFilter);
    if (logsEndpointFilter) params.append('endpoint_filter', logsEndpointFilter);
    if (logsStatusFilter) params.append('status_filter', logsStatusFilter);
    Object.entries(extra).forEach(([k, v]) => params.append(k, v));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  const fetchSystemLogs = async (isSilent = false) => {
    if (!isSilent) setLogsLoading(true);
    try {
      const q = buildLogsQuery();
      const [statsRes, reqRes, errRes, timelineRes, epRes, slowRes, listRes] = await Promise.all([
        fetch(`${API_BASE}/api/logs/stats${q}`),
        fetch(`${API_BASE}/api/logs/requests${buildLogsQuery({ limit: 30 })}`),
        fetch(`${API_BASE}/api/logs/errors${buildLogsQuery({ limit: 15 })}`),
        fetch(`${API_BASE}/api/logs/timeline${buildLogsQuery({ hours: 24 })}`),
        fetch(`${API_BASE}/api/logs/endpoints${buildLogsQuery({ limit: 8 })}`),
        fetch(`${API_BASE}/api/logs/slowest${buildLogsQuery({ limit: 8 })}`),
        fetch(`${API_BASE}/api/logs/endpoint-list`),
      ]);

      setLogsStats(await statsRes.json());
      setLogsRequests(await reqRes.json());
      setLogsErrors(await errRes.json());
      setLogsTimeline(await timelineRes.json());
      setLogsEndpoints(await epRes.json());
      setLogsSlowest(await slowRes.json());
      setLogsEndpointList(await listRes.json());
    } catch (err) {
      console.error("Fetch system logs error:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  const resetLogsFilters = () => {
    setLogsDateFilter('');
    setLogsEndpointFilter('');
    setLogsStatusFilter('');
  };

  const getStatusBadgeClass = (code) => {
    if (code >= 500) return 'bg-error/15 text-error ring-1 ring-error/25';
    if (code >= 400) return 'bg-warning/15 text-warning ring-1 ring-warning/25';
    return 'bg-success/15 text-success ring-1 ring-success/25';
  };

  const formatLogTimestamp = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts.replace('Z', '')).toLocaleString();
    } catch {
      return ts;
    }
  };

  const addNotification = (text) => {
    setNotifications(prev => [
      { id: Date.now(), text, time: "Just now", read: false },
      ...prev
    ]);
  };

  // CSV Ingest Form Submit
  const handleCSVUpload = async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('csv-file-input');
    if (!fileInput.files[0]) return;
    
    setUploadLoading(true);
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
      const res = await fetch(`${API_BASE}/api/reviews/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setUploadStatus({ success: true, message: `Successfully imported ${data.imported} new reviews!` });
        addNotification(`Imported ${data.imported} reviews via CSV.`);
        refreshDashboard(false, 'Reviews Imported (CSV)');
      } else {
        setUploadStatus({ success: false, message: data.detail || "Failed to process CSV file." });
      }
    } catch (err) {
      setUploadStatus({ success: false, message: "Server connection failed." });
    } finally {
      setUploadLoading(false);
      fileInput.value = '';
    }
  };

  // Play Store Ingest Form Submit
  const handlePlaystoreFetch = async (e) => {
    e.preventDefault();
    if (!extractedPlaystoreAppId) return;

    setFetchLoading(true);
    setFetchStatus({ success: null, message: 'Fetching reviews...' });
    setPlaystoreFetchStep('fetching');
    setPlaystoreReviewList([]);
    setPlaystoreSummary('');
    setPlaystoreInsights([]);

    try {
      const ingestRes = await fetch(`${API_BASE}/api/reviews/fetch-playstore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: extractedPlaystoreAppId, count: parseInt(fetchCount) })
      });
      const ingestData = await ingestRes.json();

      if (!ingestRes.ok) {
        setFetchStatus({ success: false, message: ingestData.detail || 'Failed to fetch reviews.' });
        setPlaystoreFetchStep('idle');
        return;
      }

      setFetchStatus({ success: true, message: `Fetched ${ingestData.imported} reviews. Running AI analysis...` });
      setPlaystoreFetchStep('analyzing');

      const [reviewsRes, summaryRes, recsRes] = await Promise.all([
        fetch(`${API_BASE}/api/reviews?app_id=${encodeURIComponent(extractedPlaystoreAppId)}&page=1&page_size=50`),
        fetch(`${API_BASE}/api/ai/summary?app_id=${encodeURIComponent(extractedPlaystoreAppId)}`),
        fetch(`${API_BASE}/api/ai/recommendations?app_id=${encodeURIComponent(extractedPlaystoreAppId)}`)
      ]);

      const [reviewsJson, summaryJson, recsJson] = await Promise.all([
        reviewsRes.json(),
        summaryRes.json(),
        recsRes.json()
      ]);

      setPlaystoreReviewList(reviewsJson.reviews || []);
      setPlaystoreSummary(summaryJson.overall_summary || '');
      setPlaystoreInsights(Array.isArray(recsJson) ? recsJson : []);
      setFetchStatus({ success: true, message: `Analysis completed for ${extractedPlaystoreAppId}.` });
      setPlaystoreFetchStep('done');
      addNotification(`Fetched and analyzed Play Store reviews for ${extractedPlaystoreAppId}.`);
      refreshDashboard(false, 'Reviews Imported (Play Store)');
    } catch (err) {
      setFetchStatus({ success: false, message: 'Server connection failed.' });
      setPlaystoreFetchStep('idle');
    } finally {
      setFetchLoading(false);
    }
  };

  // Triggered by search bar
  const handleGlobalSearchSubmit = (e) => {
    e.preventDefault();
    if (!globalSearch) return;
    setDbSearch(globalSearch);
    setDbPage(1);
    setCurrentTab('database');
  };

  // Reset database table filters
  const resetFilters = () => {
    setDbSearch('');
    setDbRating('');
    setDbSentiment('');
    setDbCategory('');
    setDbSource('');
    setDbDateFilter('');
    setDbStartDate('');
    setDbEndDate('');
    setDbSortBy('created_at');
    setDbSortOrder('DESC');
    setDbPage(1);
  };

  // Export Table Data as CSV from Backend API
  const exportToCSV = async () => {
    try {
      addNotification("Generating CSV export...");
      const params = new URLSearchParams();
      if (appId && appId !== 'all') params.append('app_id', appId);
      if (dbSearch) params.append('search', dbSearch);
      if (dbRating) params.append('rating', dbRating);
      if (dbSentiment) params.append('sentiment', dbSentiment);
      if (dbCategory) params.append('category', dbCategory);
      if (dbSource) params.append('source', dbSource);

      let computedStart = '';
      let computedEnd = '';
      const today = new Date();
      if (dbDateFilter === 'today') {
        computedStart = today.toISOString().split('T')[0];
        computedEnd = computedStart;
      } else if (dbDateFilter === '7days') {
        const past = new Date();
        past.setDate(today.getDate() - 7);
        computedStart = past.toISOString().split('T')[0];
        computedEnd = today.toISOString().split('T')[0];
      } else if (dbDateFilter === '30days') {
        const past = new Date();
        past.setDate(today.getDate() - 30);
        computedStart = past.toISOString().split('T')[0];
        computedEnd = today.toISOString().split('T')[0];
      } else if (dbDateFilter === 'custom') {
        computedStart = dbStartDate;
        computedEnd = dbEndDate;
      }

      if (computedStart) params.append('start_date', computedStart);
      if (computedEnd) params.append('end_date', computedEnd);

      const res = await fetch(`${API_BASE}/api/reviews/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", `feedback_report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification("CSV Exported successfully.");
    } catch (err) {
      console.error("Export error:", err);
      addNotification("Failed to export CSV. Please check the server.");
    }
  };

  const handleExportPdf = () => {
    if (!aiSummary.overall_summary && aiRecs.length === 0) {
      addNotification("Generate a summary or recommendations before exporting.");
      return;
    }
    exportInsightsPdf({
      overallSummary: aiSummary.overall_summary,
      recommendations: aiRecs,
    });
    addNotification("AI Insights report exported as PDF.");
  };

  // Render content depending on active tab
  const renderTabContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return renderDashboard();
      case 'realtime':
        return renderRealTimeReviews();
      case 'database':
        return renderDatabaseTable();
      case 'sentiment':
        return renderSentimentAnalytics();
      case 'category':
        return renderCategoryAnalysis();
      case 'summary':
        return renderAIInsightsPage();
      case 'systemlogs':
        return renderSystemLogsPage();
      default:
        return renderDashboard();
    }
  };

  // KPI cards config — memoized at component level (valid hook location).
  // Only recomputes when metrics data changes from the API.
  const kpiCards = useMemo(() => [
    { 
      title: "Total Reviews", 
      val: metrics.total_reviews, 
      icon: <FiInbox className="w-5 h-5 text-accent" />, 
      change: metrics.total_reviews_change, 
      sparklineData: metrics.reviews_sparkline, 
      sparklineColor: "#6366F1" 
    },
    { 
      title: "Average Rating", 
      val: metrics.avg_rating, 
      icon: <FiStar className="w-5 h-5 text-warning" />, 
      change: metrics.avg_rating_change, 
      sparklineData: metrics.rating_sparkline, 
      sparklineColor: "#F59E0B" 
    },
    { 
      title: "Positive Sentiment %", 
      val: metrics.positive_pct, 
      icon: <FiSmile className="w-5 h-5 text-success" />, 
      change: metrics.positive_pct_change, 
      sparklineData: [60, 62, 65, metrics.positive_pct], 
      sparklineColor: "#22C55E" 
    },
    { 
      title: "Negative Sentiment %", 
      val: metrics.negative_pct, 
      icon: <FiAlertTriangle className="w-5 h-5 text-error" />, 
      change: metrics.negative_pct_change, 
      sparklineData: [22, 20, 19, metrics.negative_pct], 
      sparklineColor: "#EF4444" 
    },
    { 
      title: "Reviews Added Today", 
      val: metrics.reviews_today, 
      icon: <FiCalendar className="w-5 h-5 text-purple-400" />, 
      change: metrics.reviews_today_change, 
      sparklineData: [8, 12, 10, metrics.reviews_today], 
      sparklineColor: "#A78BFA" 
    }
  ], [metrics]);

  // -----------------------------------------------------------------
  // VIEW RENDERERS
  // -----------------------------------------------------------------

  const renderDashboard = () => {

    // Format top categories chart
    const donutData = trends.category_distribution.map(item => ({
      name: item.Category,
      value: item.Count
    }));
    const colors = ["#6366F1", "#22C55E", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6", "#EC4899"];

    // Format Rating distribution
    const maxCount = Math.max(...trends.rating_distribution.map(d => d.count), 1);

    return (
      <div className="space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
          {kpiCards.map((kpi, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className="glass-card shadow-sm rounded-xl p-5 flex flex-col justify-between"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{kpi.title}</div>
                <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">{kpi.icon}</div>
              </div>
              
              <div className="flex items-baseline justify-between mt-2">
                <div>
                  <div className="text-2xl font-bold tracking-tight text-slate-850 dark:text-white">
                    <AnimatedCounter value={kpi.val} />
                    {kpi.title.includes('%') && '%'}
                  </div>
                  <div className={`text-xs font-semibold flex items-center mt-1 ${kpi.change.startsWith('-') ? 'text-error' : 'text-success'}`}>
                    {kpi.change} vs last 30 days
                  </div>
                </div>
                {/* Mini Sparkline Chart */}
                <Sparkline data={kpi.sparklineData} strokeColor={kpi.sparklineColor} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Sentiment Trend Area */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-2 glass-card rounded-xl p-6 flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-850 dark:text-white">Sentiment Trend Over Time</h3>
                <p className="text-xs text-slate-400">Chronological summary of client sentiments (Positive, Neutral, Negative)</p>
              </div>
              <span className="text-xs px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-500 font-medium">Last 30 Days</span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.sentiment_trend}>
                  <defs>
                    <linearGradient id="posColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="negColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="neuColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#E2E8F0'} />
                  <XAxis dataKey="date" stroke={theme === 'dark' ? '#94A3B8' : '#64748B'} fontSize={10} tickLine={false} />
                  <YAxis stroke={theme === 'dark' ? '#94A3B8' : '#64748B'} fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF', 
                      borderColor: theme === 'dark' ? '#334155' : '#E2E8F0',
                      color: theme === 'dark' ? '#FFFFFF' : '#000000' 
                    }} 
                  />
                  <Legend />
                  <Area type="monotone" dataKey="Positive" stroke="#22C55E" fillOpacity={1} fill="url(#posColor)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Neutral" stroke="#F59E0B" fillOpacity={1} fill="url(#neuColor)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Negative" stroke="#EF4444" fillOpacity={1} fill="url(#negColor)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Top Categories Donut Chart */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="glass-card rounded-xl p-6 flex flex-col justify-between"
          >
            <div>
              <h3 className="text-lg font-bold text-slate-850 dark:text-white mb-1">Top Categories</h3>
              <p className="text-xs text-slate-400 mb-6">Feedback classification distribution</p>
            </div>
            
            <div className="h-56 relative flex items-center justify-center">
              {donutData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF', 
                        borderColor: theme === 'dark' ? '#334155' : '#E2E8F0',
                        color: theme === 'dark' ? '#FFFFFF' : '#000000' 
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400 text-sm">No data available</div>
              )}
              {donutData.length > 0 && (
                <div className="absolute flex flex-col items-center">
                  <span className="text-2xl font-bold dark:text-white text-slate-800">
                    {metrics.total_reviews}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    Total
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 text-xs max-h-24 overflow-y-auto pr-1">
              {donutData.map((item, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                  <span className="truncate text-slate-600 dark:text-slate-300">{item.name} ({item.value})</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Rating Distribution Histogram */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="glass-card rounded-xl p-6"
        >
          <h3 className="text-lg font-bold text-slate-850 dark:text-white mb-6">Rating Distribution</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            
            {/* Average Rating stats */}
            <div className="flex flex-col items-center justify-center p-6 bg-slate-100/50 dark:bg-slate-850/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/30">
              <span className="text-5xl font-black text-slate-850 dark:text-white tracking-tight">
                {metrics.avg_rating}
              </span>
              <div className="flex items-center space-x-1 mt-2 text-warning">
                {[1, 2, 3, 4, 5].map((s) => (
                  <FiStar key={s} className={`w-5 h-5 fill-current ${s <= Math.round(metrics.avg_rating) ? 'text-warning' : 'text-slate-300 dark:text-slate-600'}`} />
                ))}
              </div>
              <span className="text-xs text-slate-400 mt-2 font-medium">Out of {metrics.total_reviews} reviews</span>
            </div>

            {/* Ratings Histogram Bars */}
            <div className="md:col-span-2 space-y-3">
              {trends.rating_distribution.slice().reverse().map((item, idx) => {
                const percentage = Math.round((item.count / maxCount) * 100) || 0;
                return (
                  <div key={idx} className="flex items-center space-x-4">
                    <span className="text-xs font-bold w-12 text-slate-500 dark:text-slate-400 flex items-center space-x-1 justify-end">
                      <span>{item.rating}</span>
                      <FiStar className="w-3.5 h-3.5 text-warning fill-current inline" />
                    </span>
                    <div className="flex-1 h-3.5 bg-slate-200 dark:bg-slate-700/60 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-accent to-indigo-400 rounded-full"
                      />
                    </div>
                    <span className="text-xs font-semibold w-12 text-slate-500 dark:text-slate-400 text-right">
                      {item.count}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>
        </motion.div>
      </div>
    );
  };

  const renderRealTimeReviews = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 p-4 rounded-xl shadow-sm">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
              <FiActivity className="mr-2 text-accent" />
              Real-Time Feed Manager
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Ingest new reviews dynamically</p>
          </div>
          <button 
            onClick={() => refreshDashboard(false, 'Manual Refresh')} 
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-accent text-white font-medium text-xs rounded-lg shadow-sm shadow-accent/20 hover:bg-accent/90"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Force Sync</span>
          </button>
        </div>

        {/* CSV and Google Play scrapers in card layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 items-start">
          {/* CSV File Uploader */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-xl p-6 flex flex-col justify-between"
          >
            <div>
              <h4 className="text-base font-bold dark:text-white text-slate-800 mb-2 flex items-center">
                <FiUploadCloud className="mr-2 text-accent" />
                Upload Customer Reviews CSV
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                Import customer statements from a spreadsheet. The CSV must contain a <strong>'review'</strong> column (and optionally <strong>'rating'</strong>).
              </p>
            </div>
            
            <form onSubmit={handleCSVUpload} className="space-y-4">
              <input 
                id="csv-file-input"
                type="file" 
                accept=".csv"
                className="w-full text-xs text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-accent file:text-white hover:file:bg-accent/80 cursor-pointer"
              />
              <button
                type="submit"
                disabled={uploadLoading}
                className="w-full py-2 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center"
              >
                {uploadLoading ? (
                  <>
                    <FiRefreshCw className="animate-spin mr-2" />
                    Ingesting and Analyzing via AI...
                  </>
                ) : "🚀 Upload & Run AI Analysis"}
              </button>
            </form>

            {uploadStatus && (
              <div className={`mt-3 text-xs p-3 rounded-lg flex items-center ${uploadStatus.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                {uploadStatus.success ? <FiCheckCircle className="mr-2 flex-shrink-0" /> : <FiAlertTriangle className="mr-2 flex-shrink-0" />}
                <span>{uploadStatus.message}</span>
              </div>
            )}
          </motion.div>

          {/* Google Play Scraper */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-xl p-6 flex flex-col justify-between"
          >
            <div>
              <h4 className="text-base font-bold dark:text-white text-slate-800 mb-2 flex items-center">
                <FiPlusCircle className="mr-2 text-warning" />
                Fetch Play Store Reviews
              </h4>
              <p className="text-xs text-slate-400 mb-4">
                Pull reviews directly from the Google Play Store and dynamically run AI classification.
              </p>
            </div>

            <form onSubmit={handlePlaystoreFetch} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Play Store URL</label>
                <input 
                  type="text" 
                  value={playstoreUrl}
                  onChange={(e) => setPlaystoreUrl(e.target.value)}
                  placeholder="https://play.google.com/store/apps/details?id=com.whatsapp"
                  className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md border border-transparent focus:border-accent text-xs dark:text-white focus:outline-none"
                />
                {playstoreUrlError && (
                  <p className="text-xs mt-2 text-error">{playstoreUrlError}</p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Extracted App ID</p>
                <p className="text-sm font-medium text-slate-900 dark:text-white">{extractedPlaystoreAppId || 'No valid Play Store URL detected'}</p>
              </div>

              <div>
                <div className="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1">
                  <span>Count to Scrape</span>
                  <span>{fetchCount} reviews</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  step="10"
                  value={fetchCount}
                  onChange={(e) => setFetchCount(e.target.value)}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={!playstoreFetchEnabled || fetchLoading}
                className="w-full py-2 bg-warning text-white rounded-md text-xs font-semibold hover:bg-warning/90 disabled:opacity-50 flex justify-center items-center"
              >
                {fetchLoading ? (
                  <>
                    <FiRefreshCw className="animate-spin mr-2" />
                    {playstoreFetchStep === 'analyzing' ? 'Running AI analysis...' : 'Fetching reviews...'}
                  </>
                ) : "📥 Fetch and Analyze Reviews"}
              </button>
            </form>

            {fetchStatus && (
              <div className={`mt-3 text-xs p-3 rounded-lg flex items-center ${fetchStatus.success ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                {fetchStatus.success ? <FiCheckCircle className="mr-2 flex-shrink-0" /> : <FiAlertTriangle className="mr-2 flex-shrink-0" />}
                <span>{fetchStatus.message}</span>
              </div>
            )}

            {playstoreFetchStep !== 'idle' && (
              <div className="mt-4 text-xs rounded-lg p-4 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                <p className="font-semibold text-slate-800 dark:text-white">Real-Time Status</p>
                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  {playstoreFetchStep === 'fetching' && 'Fetching reviews from Google Play...'}
                  {playstoreFetchStep === 'analyzing' && 'Running AI analysis on fetched reviews...'}
                  {playstoreFetchStep === 'done' && 'Fetch and AI analysis complete.'}
                </p>
              </div>
            )}

            {playstoreFetchStep === 'done' && (
              <div className="mt-4 p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200">
                <p className="font-semibold">Analysis completed successfully.</p>
                <p className="mt-2 text-slate-600 dark:text-slate-400">Your fetched Play Store reviews have been imported and analyzed. View the results in the Reviews Database or AI Insights tabs.</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    );
  };

  const renderDatabaseTable = () => {
    return (
      <div className="glass-card rounded-xl p-6 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        
        {/* Filters Form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 mb-6 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Search Text</label>
            <div className="relative">
              <input 
                type="text" 
                value={dbSearch}
                onChange={(e) => { setDbSearch(e.target.value); setDbPage(1); }}
                placeholder="Type to search..."
                className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-900 rounded-lg text-xs dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-accent"
              />
              <FiSearch className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Star Rating</label>
            <select
              value={dbRating}
              onChange={(e) => { setDbRating(e.target.value); setDbPage(1); }}
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
            >
              <option value="">All Ratings</option>
              <option value="5">5 Stars</option>
              <option value="4">4 Stars</option>
              <option value="3">3 Stars</option>
              <option value="2">2 Stars</option>
              <option value="1">1 Star</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Sentiment</label>
            <select
              value={dbSentiment}
              onChange={(e) => { setDbSentiment(e.target.value); setDbPage(1); }}
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
            >
              <option value="">All Sentiments</option>
              <option value="Positive">Positive</option>
              <option value="Neutral">Neutral</option>
              <option value="Negative">Negative</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Category</label>
            <select
              value={dbCategory}
              onChange={(e) => { setDbCategory(e.target.value); setDbPage(1); }}
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
            >
              <option value="">All Categories</option>
              <option value="Product Quality">Product Quality</option>
              <option value="Delivery">Delivery</option>
              <option value="Pricing">Pricing</option>
              <option value="Customer Support">Customer Support</option>
              <option value="Website Experience">Website Experience</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Source</label>
            <select
              value={dbSource}
              onChange={(e) => { setDbSource(e.target.value); setDbPage(1); }}
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
            >
              <option value="">All Sources</option>
              <option value="CSV">CSV File</option>
              <option value="PlayStore">Play Store</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Date Range</label>
            <select
              value={dbDateFilter}
              onChange={(e) => { setDbDateFilter(e.target.value); setDbPage(1); }}
              className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
            >
              <option value="">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {dbDateFilter === 'custom' && (
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">Start Date</label>
              <input 
                type="date"
                value={dbStartDate}
                onChange={(e) => { setDbStartDate(e.target.value); setDbPage(1); }}
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1.5">End Date</label>
              <input 
                type="date"
                value={dbEndDate}
                onChange={(e) => { setDbEndDate(e.target.value); setDbPage(1); }}
                className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs dark:text-white focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-end mb-6">
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-wide uppercase">REVIEWS DATABASE</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Total matching records: <span className="font-semibold text-accent">{dbTotal}</span></p>
          </div>
          
          <div className="flex items-center space-x-3 mt-4 md:mt-0">
            <button 
              onClick={resetFilters}
              className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition"
            >
              Reset Filters
            </button>
            <button 
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-lg transition-all transform hover:-translate-y-0.5"
            >
              <FiDownload className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr className="text-left text-[10px] uppercase font-bold tracking-wider text-slate-600 dark:text-slate-300">
                <th 
                  onClick={() => { setDbSortBy('review'); setDbSortOrder(dbSortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Review Text
                </th>
                <th 
                  onClick={() => { setDbSortBy('rating'); setDbSortOrder(dbSortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 w-24 text-center transition"
                >
                  Rating
                </th>
                <th 
                  onClick={() => { setDbSortBy('sentiment'); setDbSortOrder(dbSortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 w-32 text-center transition"
                >
                  Sentiment
                </th>
                <th 
                  onClick={() => { setDbSortBy('category'); setDbSortOrder(dbSortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 w-36 transition"
                >
                  Category
                </th>
                <th 
                  onClick={() => { setDbSortBy('source'); setDbSortOrder(dbSortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 w-28 text-center transition"
                >
                  Source
                </th>
                <th 
                  onClick={() => { setDbSortBy('created_at'); setDbSortOrder(dbSortOrder === 'ASC' ? 'DESC' : 'ASC'); }}
                  className="px-6 py-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 w-32 text-center transition"
                >
                  Date Added
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-900 text-sm">
              {dbLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-16 text-slate-500 dark:text-slate-400">
                    <FiRefreshCw className="animate-spin inline w-6 h-6 mr-3 text-accent" />
                    Loading database records...
                  </td>
                </tr>
              ) : dbReviews.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-16 text-slate-500 dark:text-slate-400 italic">
                    No matching feedback reviews found.
                  </td>
                </tr>
              ) : dbReviews.map((rev, idx) => (
                <tr key={rev.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                  <td className="px-6 py-4 dark:text-slate-200 font-medium">
                    <div className="line-clamp-2 max-w-xl" title={rev.review}>"{rev.review}"</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center space-x-1 text-warning font-semibold">
                      <span>{rev.rating || 'N/A'}</span>
                      {rev.rating && <FiStar className="w-4 h-4 fill-current" />}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      rev.sentiment === 'Positive' ? 'bg-success/10 text-success' :
                      rev.sentiment === 'Negative' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'
                    }`}>
                      {rev.sentiment}
                    </span>
                  </td>
                  <td className="px-6 py-4 dark:text-slate-300 font-semibold">{rev.category}</td>
                  <td className="px-6 py-4 text-center dark:text-slate-400">{rev.source}</td>
                  <td className="px-6 py-4 text-center dark:text-slate-400">
                    {(() => {
                      if (!rev.created_at) return 'N/A';
                      const d = new Date(rev.created_at);
                      const day = String(d.getDate()).padStart(2, '0');
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const year = d.getFullYear();
                      const hours = String(d.getHours()).padStart(2, '0');
                      const mins = String(d.getMinutes()).padStart(2, '0');
                      return `${day}-${month}-${year} ${hours}:${mins}`;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex justify-between items-center mt-6">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Page <span className="font-semibold text-slate-800 dark:text-white">{dbPage}</span> of <span className="font-semibold text-slate-800 dark:text-white">{dbPages}</span>
          </span>

          <div className="flex space-x-2">
            <button
              onClick={() => setDbPage(p => Math.max(1, p - 1))}
              disabled={dbPage === 1}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
            >
              Previous
            </button>
            <button
              onClick={() => setDbPage(p => Math.min(dbPages, p + 1))}
              disabled={dbPage === dbPages}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSentimentAnalytics = () => {
    const dataPie = [
      { name: "Positive", value: metrics.positive_pct || 0, color: "#22C55E" },
      { name: "Neutral", value: metrics.neutral_pct || 0, color: "#F59E0B" },
      { name: "Negative", value: metrics.negative_pct || 0, color: "#EF4444" }
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sentiment breakdown Pie */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-xl p-6 flex flex-col justify-between"
        >
          <div>
            <h3 className="text-lg font-bold text-slate-850 dark:text-white mb-2">Overall Sentiment Breakdown</h3>
            <p className="text-xs text-slate-400 mb-6">Pie chart highlighting proportion of positive, neutral, and negative records.</p>
          </div>

          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataPie}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  labelLine={false}
                  dataKey="value"
                  nameKey="name"
                  minAngle={5}
                >
                  {dataPie.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF', 
                    borderColor: theme === 'dark' ? '#334155' : '#E2E8F0',
                    color: theme === 'dark' ? '#FFFFFF' : '#000000' 
                  }} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Sentiment Statistics */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-xl p-6 flex flex-col justify-between"
        >
          <div>
            <h3 className="text-lg font-bold text-slate-850 dark:text-white mb-6">Sentiment Statistics</h3>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-800 dark:text-white mb-1.5">
                  <span className="text-success dark:text-green-400">Positive Ratio</span>
                  <span>{metrics.positive_pct}%</span>
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-success" style={{ width: `${metrics.positive_pct}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-800 dark:text-white mb-1.5">
                  <span className="text-warning dark:text-yellow-400">Neutral Ratio</span>
                  <span>{metrics.neutral_pct}%</span>
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-warning" style={{ width: `${metrics.neutral_pct}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-800 dark:text-white mb-1.5">
                  <span className="text-error dark:text-red-400">Negative Ratio</span>
                  <span>{metrics.negative_pct}%</span>
                </div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-error" style={{ width: `${metrics.negative_pct}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 p-4 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300 leading-relaxed border border-slate-200 dark:border-slate-700">
            <h5 className="font-bold mb-1.5 text-slate-900 dark:text-white flex items-center">
              <FiInfo className="mr-1 inline text-accent" /> Sentiment Ratio Guideline
            </h5>
            Enterprise target standard should maintain a positive sentiment score above 75%. If negative sentiments exceed 20%, product engineers are immediately alert-notified to troubleshoot.
          </div>
        </motion.div>
      </div>
    );
  };

  const renderCategoryAnalysis = () => {
    const maxCat = trends.category_distribution && trends.category_distribution.length > 0 
      ? trends.category_distribution.reduce((prev, current) => (prev.Count > current.Count) ? prev : current, {Category: 'None', Count: 0})
      : {Category: 'None', Count: 0};
      
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-850 dark:text-white mb-4">Category Distribution</h3>
            <div className="h-64">
              {trends.category_distribution && trends.category_distribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trends.category_distribution} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#334155' : '#E2E8F0'} />
                    <XAxis type="number" stroke={theme === 'dark' ? '#94A3B8' : '#64748B'} fontSize={10} tickLine={false} />
                    <YAxis type="category" dataKey="Category" stroke={theme === 'dark' ? '#94A3B8' : '#64748B'} fontSize={9} tickLine={false} width={100} />
                    <Tooltip contentStyle={{ backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF', borderColor: theme === 'dark' ? '#334155' : '#E2E8F0', color: theme === 'dark' ? '#FFFFFF' : '#000000' }} />
                    <Bar dataKey="Count" fill="#6366F1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No data available</div>
              )}
            </div>
          </motion.div>
          
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-xl p-6 flex flex-col justify-center text-center">
            <h3 className="text-lg font-bold text-slate-850 dark:text-white mb-2">Most Common Category</h3>
            <p className="text-4xl font-black text-accent my-4">{maxCat.Category}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">with <span className="text-slate-800 dark:text-white font-bold">{maxCat.Count}</span> total mentions</p>
          </motion.div>
        </div>
        
        <h3 className="text-xl font-bold text-slate-850 dark:text-white mt-8 mb-4">Category Wise Sentiment Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {trends.category_sentiment && trends.category_sentiment.length > 0 ? (
            trends.category_sentiment.map((cat, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }} className="glass-card rounded-xl p-6 shadow-sm">
                <h4 className="text-lg font-bold text-slate-850 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-700 pb-3 flex justify-between items-center">
                  <span>{cat.Category}</span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">{cat.Total} Reviews</span>
                </h4>
                <div className="space-y-4 mt-2">
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-success font-semibold flex items-center"><FiSmile className="mr-2"/> Positive</span>
                    <span className="font-bold dark:text-white text-slate-800 bg-success/10 px-2 py-0.5 rounded">{cat.Positive}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-warning font-semibold flex items-center"><FiActivity className="mr-2"/> Neutral</span>
                    <span className="font-bold dark:text-white text-slate-800 bg-warning/10 px-2 py-0.5 rounded">{cat.Neutral}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-error font-semibold flex items-center"><FiAlertTriangle className="mr-2"/> Negative</span>
                    <span className="font-bold dark:text-white text-slate-800 bg-error/10 px-2 py-0.5 rounded">{cat.Negative}</span>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="col-span-full text-center py-10 text-slate-400">No category sentiment data available</div>
          )}
        </div>
      </div>
    );
  };

  const renderAIInsightsPage = () => {
    return (
      <div className="space-y-8 max-w-5xl mx-auto pb-10">
        <div className="flex flex-col items-center md:items-start text-center md:text-left mb-6">
          <h3 className="text-3xl font-extrabold flex items-center text-slate-900 dark:text-white">
            <FiZap className="mr-3 text-accent" />
            AI Insights
          </h3>
          <p className="text-sm text-slate-400 mt-2 font-medium">Executive summary and actionable AI recommendations.</p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-center justify-center md:justify-start">
          <button 
            onClick={handleGenerateSummary} 
            disabled={summaryLoading}
            className={`flex items-center justify-center space-x-2 px-6 py-3 font-semibold text-sm rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed min-w-[220px] ${summarySuccess ? 'bg-success text-white' : 'bg-accent hover:bg-accent/90 text-white'}`}
          >
            {summaryLoading ? (
              <FiRefreshCw className="w-5 h-5 animate-spin" />
            ) : summarySuccess ? (
              <FiCheckCircle className="w-5 h-5" />
            ) : (
              <FiCpu className="w-5 h-5" />
            )}
            <span>{summaryLoading ? 'Generating Summary...' : summarySuccess ? 'Summary Generated!' : aiSummary.overall_summary ? 'Fetch New Summary' : 'Generate Summary'}</span>
          </button>
          
          <button 
            onClick={handleGenerateRecommendations} 
            disabled={recsLoading}
            className={`flex items-center justify-center space-x-2 px-6 py-3 font-semibold text-sm rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:hover:scale-100 disabled:cursor-not-allowed min-w-[220px] ${recsSuccess ? 'bg-success text-white' : 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100'}`}
          >
            {recsLoading ? (
              <FiRefreshCw className="w-5 h-5 animate-spin" />
            ) : recsSuccess ? (
              <FiCheckCircle className="w-5 h-5" />
            ) : (
              <FiCheckCircle className="w-5 h-5" />
            )}
            <span>{recsLoading ? 'Generating Recommendations...' : recsSuccess ? 'Recommendations Generated!' : aiRecs.length > 0 ? 'Fetch New Recommendations' : 'Generate Recommendations'}</span>
          </button>

          <button 
            onClick={handleExportPdf}
            className="flex items-center justify-center space-x-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-lg transition-all transform hover:scale-105 active:scale-95 min-w-[220px]"
          >
            <FiDownload className="w-5 h-5" />
            <span>Export Complete Report PDF</span>
          </button>
        </div>

        <hr className="border-slate-200 dark:border-slate-800" />

        <div className="space-y-6">
          <h4 className="text-xl font-bold text-slate-850 dark:text-white">Overall Summary</h4>

          {summaryError && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-start justify-between gap-4">
              <div className="flex items-start">
                <FiAlertTriangle className="w-5 h-5 mr-3 mt-0.5 shrink-0" />
                <div>
                  <strong className="block font-bold mb-1">Generation Failed</strong>
                  {summaryError}
                </div>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={summaryLoading}
                className="shrink-0 px-3 py-1.5 bg-error text-white text-xs font-bold rounded-lg hover:bg-error/90 disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}

          {summaryLoading && (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400 font-medium glass-card rounded-2xl">
              <FiRefreshCw className="animate-spin inline w-10 h-10 mb-4 text-accent" />
              <div className="text-sm">Synthesizing review sentiments and generating insights...</div>
            </div>
          )}
          
          {!summaryLoading && !summaryError && !aiSummary.overall_summary && (
            <div className="text-center py-12 glass-card rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
              <FiCpu className="inline w-10 h-10 mb-3 text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Click <strong>Generate Summary</strong> to analyze your review data with AI.</p>
            </div>
          )}

          {!summaryLoading && !summaryError && aiSummary.overall_summary && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {(() => {
                const text = aiSummary.overall_summary || '';
                const sections = text.split(/##\s+/).filter(s => s.trim().length > 0);
                if (sections.length === 0) return null;
                
                if (sections.length === 1 && !text.includes('##')) {
                  return (
                    <div className="col-span-full glass-card rounded-2xl p-8 shadow-sm text-slate-650 dark:text-slate-300 leading-relaxed text-[15px]">
                      {text}
                    </div>
                  );
                }

                return sections.map((section, idx) => {
                  const lines = section.split('\n');
                  const title = lines[0].trim();
                  const content = lines.slice(1).join('\n').trim();
                  
                  const isFullWidth = title.toLowerCase().includes('executive summary') || title.toLowerCase().includes('key takeaways');
                  
                  return (
                    <div key={idx} className={`glass-card rounded-2xl p-6 shadow-sm flex flex-col h-full transform transition-all hover:-translate-y-1 hover:shadow-md ${isFullWidth ? 'col-span-full' : ''}`}>
                      <h4 className="text-lg font-bold text-slate-850 dark:text-white leading-snug mb-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                        {title}
                      </h4>
                      <div className="text-[14px] text-slate-650 dark:text-slate-400 leading-relaxed flex-grow whitespace-pre-wrap">
                        {content}
                      </div>
                    </div>
                  );
                });
              })()}
            </motion.div>
          )}
        </div>

        <hr className="border-slate-200 dark:border-slate-800" />

        <div className="space-y-6">
          <h4 className="text-xl font-bold text-slate-850 dark:text-white">AI Recommendations</h4>

          {recsError && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-start justify-between gap-4">
              <div className="flex items-start">
                <FiAlertTriangle className="w-5 h-5 mr-3 mt-0.5 shrink-0" />
                <div>
                  <strong className="block font-bold mb-1">Generation Failed</strong>
                  {recsError}
                </div>
              </div>
              <button
                onClick={handleGenerateRecommendations}
                disabled={recsLoading}
                className="shrink-0 px-3 py-1.5 bg-error text-white text-xs font-bold rounded-lg hover:bg-error/90 disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}

          {recsLoading && (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400 font-medium glass-card rounded-2xl">
              <FiRefreshCw className="animate-spin inline w-10 h-10 mb-4 text-indigo-400" />
              <div className="text-sm">Calculating data correlations and writing actionable steps...</div>
            </div>
          )}

          {!recsLoading && !recsError && aiRecs.length === 0 && (
            <div className="text-center py-12 glass-card rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
              <FiCheckCircle className="inline w-10 h-10 mb-3 text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Click <strong>Generate Recommendations</strong> to get AI-powered business action cards.</p>
            </div>
          )}

          {!recsLoading && !recsError && aiRecs.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {aiRecs.map((rec, idx) => {
                  const isHigh = rec.priority?.toLowerCase() === 'high';
                  const isMedium = rec.priority?.toLowerCase() === 'medium';
                  const badgeColors = isHigh 
                    ? 'bg-error/10 text-error border border-error/20' 
                    : isMedium 
                      ? 'bg-warning/10 text-warning border border-warning/20' 
                      : 'bg-success/10 text-success border border-success/20';
                  
                  return (
                    <div key={idx} className="glass-card rounded-2xl p-6 shadow-sm flex flex-col h-full transform transition-all hover:-translate-y-1 hover:shadow-md">
                      <div className="mb-4">
                        <span className={`text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider ${badgeColors}`}>
                          {rec.priority || "Medium"} Priority
                        </span>
                      </div>
                      
                      <h4 className="text-lg font-bold text-slate-850 dark:text-white leading-snug mb-3">
                        {rec.title || "Recommendation"}
                      </h4>

                      <p className="text-[14px] text-slate-650 dark:text-slate-400 leading-relaxed mb-6 flex-grow">
                        {rec.description || rec.problem || rec.action || ""}
                      </p>
                      
                      <div className="pt-5 border-t border-slate-100 dark:border-slate-800/80">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Expected Impact</div>
                        <div className="text-sm font-bold text-indigo-500 dark:text-indigo-400">{rec.impact || "Medium"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    );
  };

  const renderSystemLogsPage = () => {
    if (logsLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-32 text-slate-400">
          <FiRefreshCw className="w-10 h-10 animate-spin text-accent mb-4" />
          <span className="text-sm font-semibold">Loading system monitoring data...</span>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-r from-accent/10 via-indigo-500/5 to-transparent dark:from-accent/20 dark:via-indigo-500/10 p-5 rounded-xl border border-accent/20 dark:border-accent/30">
          <div>
            <h3 className="text-lg font-bold text-slate-850 dark:text-white flex items-center">
              <FiServer className="mr-2 text-accent" />
              System Logs
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Review recent API requests and system events
            </p>
          </div>
          <button
            onClick={() => fetchSystemLogs()}
            className="flex items-center space-x-1.5 px-4 py-2 bg-accent text-white font-medium text-xs rounded-lg shadow-sm shadow-accent/30 hover:bg-accent/90 transition-all hover:scale-[1.02]"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Logs</span>
          </button>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-4"
        >
          <div className="flex items-center space-x-2 mb-3">
            <FiFilter className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Log Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Date</label>
              <input
                type="date"
                value={logsDateFilter}
                onChange={(e) => setLogsDateFilter(e.target.value)}
                className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Endpoint</label>
              <select
                value={logsEndpointFilter}
                onChange={(e) => setLogsEndpointFilter(e.target.value)}
                className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md text-xs dark:text-white focus:outline-none"
              >
                <option value="">All Endpoints</option>
                {logsEndpointList.map((ep) => (
                  <option key={ep} value={ep}>{ep}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Status Code</label>
              <select
                value={logsStatusFilter}
                onChange={(e) => setLogsStatusFilter(e.target.value)}
                className="w-full p-2 bg-slate-100 dark:bg-slate-800 rounded-md text-xs dark:text-white focus:outline-none"
              >
                <option value="">All Status Codes</option>
                <option value="200">200 OK</option>
                <option value="400">400 Bad Request</option>
                <option value="404">404 Not Found</option>
                <option value="500">500 Server Error</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={resetLogsFilters}
                className="w-full py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-accent border border-slate-200 dark:border-slate-700 rounded-md hover:border-accent/50 transition-colors"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </motion.div>

        {/* Recent API Requests */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-6"
        >
          <h4 className="text-base font-bold dark:text-white mb-4 flex items-center">
            <FiActivity className="mr-2 text-accent w-4 h-4" />
            Recent API Requests
          </h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-96 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-850 sticky top-0">
                <tr className="text-left text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Method</th>
                  <th className="px-4 py-2">Endpoint</th>
                  <th className="px-4 py-2 text-center">Status</th>
                  <th className="px-4 py-2 text-right">Time (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logsRequests.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-400 italic">No requests logged yet</td>
                  </tr>
                ) : logsRequests.map((req, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatLogTimestamp(req.timestamp)}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-bold text-accent">{req.method}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] dark:text-slate-300 truncate max-w-[200px]" title={req.endpoint}>
                      {req.endpoint}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getStatusBadgeClass(req.status_code)}`}>
                        {req.status_code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold dark:text-slate-300">
                      {req.response_time_ms?.toFixed?.(1) ?? req.response_time_ms}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-darkBg text-slate-800 dark:text-slate-100 transition-colors duration-200">
      
      {/* LEFT SIDEBAR NAVIGATION — fixed, full viewport height, never scrolls */}
      <aside className="fixed top-0 left-0 z-50 w-64 h-screen overflow-hidden bg-white dark:bg-darkSidebar border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between hidden md:flex">
        <div className="flex-shrink-0">
          {/* Logo Brand */}
          <div className="h-16 flex items-center space-x-2 px-6 border-b border-slate-200 dark:border-slate-800/80">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-indigo-400 flex items-center justify-center text-white font-black text-lg tracking-tighter">
              A
            </div>
            <div>
              <span className="font-extrabold text-sm text-slate-850 dark:text-white">AI Feedback Analyzer</span>
              <span className="text-[9px] block text-accent font-bold uppercase tracking-widest mt-0.5">SaaS Platform</span>
            </div>
          </div>

          {/* Menu items */}
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setCurrentTab(tab.id);
                  if (tab.id === 'database') resetFilters();
                }}
                className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 relative ${
                  currentTab === tab.id 
                    ? 'bg-accent text-white shadow-md shadow-accent/30 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-1 before:bg-white before:rounded-r-full before:opacity-60' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-accent dark:hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/15 hover:border-l-2 hover:border-accent/50 hover:pl-[14px]'
                }`}
              >
                {tab.icon}
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Sync Info bottom bar */}
        <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/10">
          <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-medium">
            <FiRefreshCw className={`w-3.5 h-3.5 text-accent ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing dashboard...' : 'Manual dashboard refresh only'}</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT WORKSPACE AREA — offset by sidebar width */}
      <div className="md:ml-64 h-screen flex flex-col overflow-hidden">
        
        {/* TOP NAVBAR */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800/60 bg-white dark:bg-darkSidebar flex items-center justify-between px-6 z-10 flex-shrink-0">
          
          {/* Left: search form */}
          <form onSubmit={handleGlobalSearchSubmit} className="relative w-64 md:w-80">
            <input 
              type="text" 
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search statements globally..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs dark:text-white focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <FiSearch className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          </form>

          {/* Right: app selector, theme toggle, notifications, profile, date clock */}
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2">
              <label className="text-[10px] uppercase font-bold text-slate-400">App</label>
              <select
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs dark:text-white border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Apps</option>
                {availableApps.map((item) => (
                  <option key={item.app_id} value={item.app_id}>{item.app_name || item.app_id}</option>
                ))}
              </select>
            </div>
            
            {/* Clock Widget */}
            <div className="hidden lg:flex items-center space-x-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <FiCalendar className="w-4 h-4 text-slate-400" />
              <span>
                {currentTime.toLocaleString("en-US", { 
                  weekday: 'short', 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </span>
            </div>

            {/* Theme Toggle switch */}
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <FiSun className="w-4 h-4" /> : <FiMoon className="w-4 h-4" />}
            </button>


            {/* User Profile Avatar */}
            <div className="flex items-center space-x-2 border-l border-slate-200 dark:border-slate-800/80 pl-4">
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white font-extrabold text-xs">
                U
              </div>
              <div className="hidden sm:block text-left">
                <span className="text-xs font-bold block dark:text-white">Admin User</span>
                <span className="text-[9px] text-slate-400 block font-medium">Enterprise Administrator</span>
              </div>
            </div>

          </div>
        </header>

        {/* DYNAMIC COMPONENT PANEL CANVAS */}
        <main className="flex-1 overflow-y-auto p-6">
          {loading && currentTab === 'dashboard' ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <FiRefreshCw className="w-10 h-10 animate-spin text-accent mb-4" />
              <span className="text-sm font-semibold">Synchronizing metrics dashboard...</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                {renderTabContent()}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

    </div>
  );
}
