type RevenueInput = {
  totalRevenue?: unknown;
  ticketsSold?: unknown;
  avgTicketPrice?: unknown;
  capacity?: unknown;
  demandScore?: unknown;
  predictionOutputs?: Array<{
    expectedRevenue?: unknown;
    expectedAttendance?: unknown;
    demandScore?: unknown;
    features?: unknown;
  }>;
};

export const toFiniteNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === 'object') {
    const maybeDecimal = value as { toNumber?: () => number; toString?: () => string };

    if (typeof maybeDecimal.toNumber === 'function') {
      const parsed = maybeDecimal.toNumber();
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (typeof maybeDecimal.toString === 'function') {
      const parsed = Number(maybeDecimal.toString());
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }

  return 0;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const readFeatureNumber = (features: unknown, key: string): number => {
  if (!features || typeof features !== 'object' || !(key in features)) return 0;
  return toFiniteNumber((features as Record<string, unknown>)[key]);
};

export const calculateConcertMetrics = (concert: RevenueInput) => {
  const prediction = concert.predictionOutputs?.[0];
  const predictionFeatures = prediction?.features;

  const predictedCapacity = readFeatureNumber(predictionFeatures, 'venue_capacity');
  const predictedAvgTicketPrice = readFeatureNumber(predictionFeatures, 'avg_ticket_price');
  const predictedAttendance = toFiniteNumber(prediction?.expectedAttendance);
  const predictedRevenue = toFiniteNumber(prediction?.expectedRevenue);
  const predictedDemandScore = toFiniteNumber(prediction?.demandScore);

  const storedRevenue = toFiniteNumber(concert.totalRevenue);
  let ticketsSold = toFiniteNumber(concert.ticketsSold);
  let avgTicketPrice = toFiniteNumber(concert.avgTicketPrice);

  const capacity = toFiniteNumber(concert.capacity) || predictedCapacity;
  const demandScore = toFiniteNumber(concert.demandScore) || predictedDemandScore;

  if (ticketsSold <= 0 && predictedAttendance > 0) {
    ticketsSold = Math.round(predictedAttendance);
  }

  if (avgTicketPrice <= 0 && predictedAvgTicketPrice > 0) {
    avgTicketPrice = predictedAvgTicketPrice;
  }

  let totalRevenue = storedRevenue;
  if (totalRevenue <= 0 && ticketsSold > 0 && avgTicketPrice > 0) {
    totalRevenue = ticketsSold * avgTicketPrice;
  }
  if (totalRevenue <= 0 && predictedRevenue > 0) {
    totalRevenue = predictedRevenue;
  }

  if (ticketsSold <= 0 && totalRevenue > 0 && avgTicketPrice > 0) {
    ticketsSold = Math.round(totalRevenue / avgTicketPrice);
  }

  if (avgTicketPrice <= 0 && totalRevenue > 0 && ticketsSold > 0) {
    avgTicketPrice = totalRevenue / ticketsSold;
  }

  return {
    capacity: capacity > 0 ? Math.round(capacity) : concert.capacity ?? null,
    ticketsSold: ticketsSold > 0 ? Math.round(ticketsSold) : 0,
    avgTicketPrice: avgTicketPrice > 0 ? roundMoney(avgTicketPrice) : concert.avgTicketPrice ?? null,
    totalRevenue: totalRevenue > 0 ? roundMoney(totalRevenue) : 0,
    demandScore: demandScore > 0 ? roundMoney(demandScore) : concert.demandScore ?? null,
  };
};

export const calculateConcertRevenue = (concert: RevenueInput): number => {
  return calculateConcertMetrics(concert).totalRevenue;
};

export const withCalculatedConcertRevenue = <T extends RevenueInput>(
  concert: T
): Omit<T, 'predictionOutputs'> & ReturnType<typeof calculateConcertMetrics> => {
  const normalized = {
    ...concert,
    ...calculateConcertMetrics(concert),
  };
  delete (normalized as { predictionOutputs?: unknown }).predictionOutputs;
  return normalized as Omit<T, 'predictionOutputs'> & ReturnType<typeof calculateConcertMetrics>;
};
