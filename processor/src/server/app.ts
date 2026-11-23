import { paymentSDK } from "../payment-sdk.js";
import { NuveiPaymentService } from "../services/nuvei-payment.service.js";
import { OrderPaymentStateSync } from "../services/order-payment-state.service.js";

const paymentService = new NuveiPaymentService({
  ctCartService: paymentSDK.ctCartService,
  ctPaymentService: paymentSDK.ctPaymentService,
  ctOrderService: paymentSDK.ctOrderService,
  ctCartClient: paymentSDK.ctAPI.client,
  ctPaymentClient: paymentSDK.ctAPI.client,
  orderPaymentStateSync: new OrderPaymentStateSync({ client: paymentSDK.ctAPI.client }),
});

export const app = {
  services: {
    paymentService,
  },
};
