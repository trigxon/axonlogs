import { useSettings } from '../../contexts/SettingsContext';

const PanicScreen = () => {
  const { setPanicState } = useSettings();

  const handleDoubleClick = () => {
    setPanicState(false);
  };

  return (
    <div 
      className="fixed inset-0 bg-white z-[9999] text-black flex flex-col items-center justify-center font-sans select-none"
      onDoubleClick={handleDoubleClick}
      title="Double click to restore terminal"
    >
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-6xl font-bold text-gray-800">404</h1>
        <h2 className="text-2xl font-semibold text-gray-600">Page Not Found</h2>
        <p className="text-gray-500 mt-4">
          The requested URL was not found on this server. That's all we know.
        </p>
      </div>
    </div>
  );
};

export default PanicScreen;
