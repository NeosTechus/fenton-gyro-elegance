import { useState } from "react";
import { CreditCard, Loader2, CheckCircle, XCircle, Wifi, WifiOff } from "lucide-react";
import { sendCreditSale, dollarsToCents, isValorConfigured, ValorSuccessResponse } from "@/lib/valor";

interface ValorPaymentProps {
  totalAmount: number; // in dollars, e.g. 12.50
  tipEnabled?: boolean;
  orderNumber?: number;
  lineItems?: { name: string; price: number; quantity: number }[];
  epi: string;
  appkey: string;
  onSuccess: (response: ValorSuccessResponse) => void;
  onCancel: () => void;
}

type PaymentState = "idle" | "processing" | "success" | "error";

const ValorPayment = ({
  totalAmount,
  tipEnabled = true,
  orderNumber,
  lineItems,
  epi,
  appkey,
  onSuccess,
  onCancel,
}: ValorPaymentProps) => {
  const [state, setState] = useState<PaymentState>("idle");
  const [error, setError] = useState("");
  const [response, setResponse] = useState<ValorSuccessResponse | null>(null);
  const configured = isValorConfigured();

  const handlePayment = async () => {
    setState("processing");
    setError("");

    try {
      const result = await sendCreditSale({
        amountCents: dollarsToCents(totalAmount),
        tipEnabled,
        printReceipt: true,
        invoiceNumber: orderNumber?.toString(),
        lineItems: lineItems?.map((item) => ({
          product_code: item.name,
          quantity: item.quantity.toString(),
          total: item.price.toFixed(2),
        })),
        epi,
        appkey,
      });

      setResponse(result);
      setState("success");
      onSuccess(result);
    } catch (err: any) {
      setError(err.message || "Payment failed");
      setState("error");
    }
  };

  if (!configured) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <WifiOff className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground font-sans">
          Valor terminal not configured.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Select a terminal on the Settings page.
        </p>
      </div>
    );
  }

  // Success state
  if (state === "success" && response) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center animate-fade-up">
        <CheckCircle className="w-14 h-14 text-green-500 mb-4" />
        <h3 className="font-serif text-xl font-medium mb-1">Payment Approved</h3>
        <p className="text-2xl font-sans font-bold text-accent mb-3">
          ${(parseInt(response.AMOUNT) / 100).toFixed(2)}
        </p>
        <div className="bg-muted/50 rounded-sm p-3 w-full max-w-xs space-y-1 text-xs font-sans text-muted-foreground">
          <div className="flex justify-between">
            <span>Card</span>
            <span className="font-semibold text-foreground">{response.MASKED_PAN}</span>
          </div>
          <div className="flex justify-between">
            <span>Auth Code</span>
            <span className="font-semibold text-foreground">{response.CODE}</span>
          </div>
          <div className="flex justify-between">
            <span>RRN</span>
            <span className="font-semibold text-foreground">{response.RRN}</span>
          </div>
          <div className="flex justify-between">
            <span>Network</span>
            <span className="font-semibold text-foreground">{response.ISSUER}</span>
          </div>
          {response.TIP_AMOUNT && parseInt(response.TIP_AMOUNT) > 0 && (
            <div className="flex justify-between">
              <span>Tip</span>
              <span className="font-semibold text-foreground">
                ${(parseInt(response.TIP_AMOUNT) / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center animate-fade-up">
        <XCircle className="w-14 h-14 text-destructive mb-4" />
        <h3 className="font-serif text-xl font-medium mb-2">Payment Failed</h3>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={handlePayment}
            className="px-6 py-3 bg-accent text-accent-foreground font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-[0.97] transition-all"
          >
            Try Again
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-3 border border-border font-sans font-semibold text-sm uppercase tracking-wider rounded-sm hover:bg-muted active:scale-[0.97] transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Processing state
  if (state === "processing") {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center animate-fade-up">
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-full border-4 border-accent/20 flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
          </div>
          <Wifi className="absolute -top-1 -right-1 w-5 h-5 text-green-500" />
        </div>
        <h3 className="font-serif text-xl font-medium mb-2">Waiting for Terminal</h3>
        <p className="text-sm text-muted-foreground mb-1">
          Present card on the payment terminal
        </p>
        <p className="text-xs text-muted-foreground/60">
          Tap, insert, or swipe to pay <span className="font-semibold text-accent">${totalAmount.toFixed(2)}</span>
        </p>
      </div>
    );
  }

  // Idle state — ready to send
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <button
        onClick={handlePayment}
        className="w-full py-4 bg-accent text-accent-foreground font-sans font-bold text-base uppercase tracking-wider rounded-md flex items-center justify-center gap-2.5 hover:opacity-90 active:scale-[0.96] transition-all shadow-md"
      >
        <CreditCard className="w-5 h-5" />
        Pay ${totalAmount.toFixed(2)} on Terminal
      </button>
    </div>
  );
};

export default ValorPayment;
