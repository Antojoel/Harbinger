import React, { useState } from 'react';

export const PricingCheckout: React.FC = () => {
  const [paid, setPaid] = useState(false);

  return (
    <div className="p-6 rounded-xl border border-slate-700 bg-slate-900 text-white space-y-4">
      <h3 className="text-lg font-bold">5. Pricing & Razorpay Checkout Stub</h3>
      <p className="text-xs text-slate-400">
        ROI math callout ($35 fee vs ~$800 avg demurrage saved) & Razorpay checkout button.
      </p>

      <div className="p-4 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
        ROI Math: $35 Guard Fee vs ~$800 Avg Demurrage Cost (23x ROI)
      </div>

      <button
        onClick={() => setPaid(true)}
        className="px-4 py-2.5 rounded bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-sm text-white"
      >
        {paid ? '✓ Razorpay Payment Confirmed' : 'Pay $35 via Razorpay'}
      </button>
    </div>
  );
};
