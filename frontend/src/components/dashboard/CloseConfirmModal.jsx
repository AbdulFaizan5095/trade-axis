import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function CloseConfirmModal({
  trade,
  onCancel,
  onConfirmClose, // (qty) => Promise
  formatINR,
  allowPartialClose = true,
}) {
  const maxQty = Number(trade?.quantity || 0);

  const [isPartial, setIsPartial] = useState(false);
  const [qty, setQty] = useState(maxQty);

  useEffect(() => {
    setIsPartial(false);
    setQty(maxQty);
  }, [trade?.id, maxQty]);

  if (!trade) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl"
        style={{ background: '#1e222d', border: '1px solid #363a45' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: '#363a45' }}>
          <h3 className="font-bold text-lg" style={{ color: '#d1d4dc' }}>Close Position</h3>
          <button onClick={onCancel}><X size={22} color="#787b86" /></button>
        </div>

        <div className="p-4">
          <div className="p-3 rounded-lg mb-4" style={{ background: '#2a2e39' }}>
            <div className="font-bold" style={{ color: '#d1d4dc' }}>{trade.symbol}</div>
            <div className="text-sm mt-1" style={{ color: '#787b86' }}>
              Qty: {maxQty} • {String(trade.trade_type || '').toUpperCase()}
            </div>
          </div>

          {allowPartialClose && maxQty > 1 && (
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg" style={{ background: '#2a2e39' }}>
                <input
                  type="checkbox"
                  checked={isPartial}
                  onChange={(e) => {
                    setIsPartial(e.target.checked);
                    if (!e.target.checked) setQty(maxQty);
                  }}
                />
                <span className="text-sm" style={{ color: '#d1d4dc' }}>Partial close</span>
              </label>
            </div>
          )}

          {allowPartialClose && isPartial && (
            <div className="mb-4">
              <label className="block text-sm mb-2" style={{ color: '#787b86' }}>
                Quantity to close (1 - {maxQty})
              </label>
              <input
                type="number"
                value={qty}
                min={1}
                max={maxQty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value || 1))))}
                className="w-full px-4 py-3 rounded-lg text-xl font-bold text-center"
                style={{ background: '#2a2e39', border: '1px solid #363a45', color: '#d1d4dc' }}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onCancel}
              className="py-3 rounded-lg font-medium"
              style={{ background: '#2a2e39', color: '#d1d4dc', border: '1px solid #363a45' }}
            >
              Cancel
            </button>

            <button
              onClick={async () => {
                if (isPartial && (qty <= 0 || qty > maxQty)) return toast.error('Invalid quantity');
                await onConfirmClose(isPartial ? qty : maxQty);
              }}
              className="py-3 rounded-lg font-semibold text-white"
              style={{ background: '#ef5350' }}
            >
              Close
            </button>
          </div>

          <div className="text-xs mt-3" style={{ color: '#787b86' }}>
            Note: Partial close requires backend/tradingStore support.
          </div>
        </div>
      </div>
    </div>
  );
}