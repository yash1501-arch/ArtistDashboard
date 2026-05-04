function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
      <h1 className="text-6xl font-bold text-brand-navy">404</h1>
      <p className="text-gray-500 mt-4 text-lg">Page not found</p>
      <a href="/dashboard" className="mt-6 text-brand-blue underline">Go to Dashboard</a>
    </div>
  )
}
export default NotFound