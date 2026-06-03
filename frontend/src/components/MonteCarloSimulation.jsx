import React, { useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Loader2, TrendingUp, TrendingDown, Activity, BarChart3, Target, ShieldAlert } from 'lucide-react';

const MonteCarloSimulation = ({ ticker }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  const [strategy, setStrategy] = useState('all');
  const [days, setDays] = useState(90);
  const [timeframe, setTimeframe] = useState('intraday');
  const [simulations, setSimulations] = useState(1000);
  const [initialCapital, setInitialCapital] = useState(100000);

  const runSimulation = async () => {
    if (!ticker) {
      setError('कृपया पहले कोई stock select करें');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
      const response = await axios.post(`${BACKEND_URL}/api/monte-carlo`, {
        ticker,
        strategy,
        days: parseInt(days),
        timeframe,
        simulations: parseInt(simulations),
        initial_capital: parseFloat(initialCapital)
      });

      setResult(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Simulation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getReturnColor = (value) => {
    if (value > 15) return 'text-green-600';
    if (value > 5) return 'text-green-500';
    if (value > 0) return 'text-green-400';
    if (value > -5) return 'text-orange-400';
    if (value > -10) return 'text-orange-500';
    return 'text-red-500';
  };

  const getReturnBadge = (value) => {
    if (value > 10) return <Badge className="bg-green-600">EXCELLENT</Badge>;
    if (value > 5) return <Badge className="bg-green-500">GOOD</Badge>;
    if (value > 0) return <Badge className="bg-blue-500">POSITIVE</Badge>;
    if (value > -5) return <Badge className="bg-orange-500">MILD LOSS</Badge>;
    return <Badge className="bg-red-600">HIGH RISK</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Monte Carlo Simulation
          </CardTitle>
          <CardDescription>
            Strategy robustness testing के लिए {simulations} randomized scenarios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Strategies</SelectItem>
                  <SelectItem value="smc">SMC</SelectItem>
                  <SelectItem value="demon">DEMON</SelectItem>
                  <SelectItem value="falling_knife">Falling Knife</SelectItem>
                  <SelectItem value="golden_setup">Golden Setup</SelectItem>
                  <SelectItem value="reverse_swings">Reverse Swings</SelectItem>
                  <SelectItem value="godzilla">Godzilla</SelectItem>
                  <SelectItem value="amds">AMDS-Hybrid</SelectItem>
                  <SelectItem value="narrative_swing">Narrative Swing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intraday">Intraday (30m)</SelectItem>
                  <SelectItem value="short_term">Daily</SelectItem>
                  <SelectItem value="mid_term">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Days</Label>
              <Input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                min="30"
                max="365"
              />
            </div>

            <div>
              <Label>Simulations</Label>
              <Input
                type="number"
                value={simulations}
                onChange={(e) => setSimulations(e.target.value)}
                min="100"
                max="10000"
              />
            </div>

            <div>
              <Label>Initial Capital (₹)</Label>
              <Input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                min="10000"
              />
            </div>

            <div className="flex items-end">
              <Button
                onClick={runSimulation}
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Run Simulation
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-6 mt-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">
                      Avg Return
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getReturnColor(result.avg_return)}`}>
                      {result.avg_return > 0 ? '+' : ''}{result.avg_return}%
                    </div>
                    <div className="mt-1">
                      {getReturnBadge(result.avg_return)}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Median: {result.median_return}%
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">
                      Win Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {result.avg_win_rate}%
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Median: {result.median_win_rate}%
                    </div>
                    <div className="text-xs text-gray-500">
                      Range: {result.winrate_percentiles['5th']}% - {result.winrate_percentiles['95th']}%
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">
                      Max Drawdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">
                      -{result.avg_max_drawdown}%
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Worst: -{result.worst_drawdown}%
                    </div>
                    <div className="text-xs text-gray-500">
                      95th: -{result.drawdown_percentiles['95th']}%
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-500">
                      Sharpe Ratio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${result.avg_sharpe > 1 ? 'text-green-600' : result.avg_sharpe > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {result.avg_sharpe}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      Median: {result.median_sharpe}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Return Range */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Return Range
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div className="text-center p-3 bg-green-50 rounded">
                      <div className="text-xs text-gray-600">Best</div>
                      <div className="text-lg font-bold text-green-600">+{result.best_return}%</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded">
                      <div className="text-xs text-gray-600">95th %ile</div>
                      <div className="text-lg font-bold text-blue-600">
                        {result.return_percentiles['95th'] > 0 ? '+' : ''}{result.return_percentiles['95th']}%
                      </div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <div className="text-xs text-gray-600">Median</div>
                      <div className="text-lg font-bold text-gray-700">
                        {result.median_return > 0 ? '+' : ''}{result.median_return}%
                      </div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded">
                      <div className="text-xs text-gray-600">5th %ile</div>
                      <div className="text-lg font-bold text-orange-600">
                        {result.return_percentiles['5th'] > 0 ? '+' : ''}{result.return_percentiles['5th']}%
                      </div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded">
                      <div className="text-xs text-gray-600">Worst</div>
                      <div className="text-lg font-bold text-red-600">{result.worst_return}%</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-gray-600">
                    Standard Deviation: ±{result.std_return}%
                  </div>
                </CardContent>
              </Card>

              {/* Probability Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" />
                    Success Probability
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg">
                      <div className="text-sm text-gray-600">Positive Return Probability</div>
                      <div className="text-3xl font-bold text-green-600 mt-1">
                        {result.prob_positive_return}%
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        {result.simulations} simulations में से {Math.round(result.simulations * result.prob_positive_return / 100)} positive
                      </div>
                    </div>
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg">
                      <div className="text-sm text-gray-600">Beat Market (10%) Probability</div>
                      <div className="text-3xl font-bold text-blue-600 mt-1">
                        {result.prob_above_market}%
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        10% benchmark से बेहतर performance की probability
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Return Distribution Histogram */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Return Distribution</CardTitle>
                  <CardDescription>
                    {result.simulations} simulations का histogram
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={result.return_distribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="bin_start"
                        tickFormatter={(value) => `${value.toFixed(0)}%`}
                        label={{ value: 'Return (%)', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }} />
                      <Tooltip
                        formatter={(value, name) => [value, 'Count']}
                        labelFormatter={(value) => `Return: ${value.toFixed(1)}%`}
                      />
                      <Bar dataKey="count" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="text-center text-xs text-gray-500 mt-2">
                    Bell curve shows normal distribution - most results cluster around average
                  </div>
                </CardContent>
              </Card>

              {/* Sample Simulations */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Sample Simulations</CardTitle>
                  <CardDescription>
                    Random samples from {result.simulations} runs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Sim #</th>
                          <th className="text-right p-2">Return</th>
                          <th className="text-right p-2">Win Rate</th>
                          <th className="text-right p-2">Max DD</th>
                          <th className="text-right p-2">Sharpe</th>
                          <th className="text-right p-2">Trades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.sample_simulations.map((sim, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="p-2">{sim.simulation_id}</td>
                            <td className={`text-right p-2 font-medium ${getReturnColor(sim.total_return)}`}>
                              {sim.total_return > 0 ? '+' : ''}{sim.total_return}%
                            </td>
                            <td className="text-right p-2">{sim.win_rate}%</td>
                            <td className="text-right p-2 text-red-600">-{sim.max_drawdown}%</td>
                            <td className="text-right p-2">{sim.sharpe_ratio}</td>
                            <td className="text-right p-2">{sim.total_trades}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Confidence Intervals */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Confidence Intervals</CardTitle>
                  <CardDescription>
                    Statistical ranges showing outcome probabilities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium mb-2">Return Percentiles</div>
                      <div className="grid grid-cols-5 gap-2 text-center text-xs">
                        <div className="p-2 bg-gray-50 rounded">
                          <div className="text-gray-600">5th</div>
                          <div className="font-bold">{result.return_percentiles['5th']}%</div>
                        </div>
                        <div className="p-2 bg-gray-100 rounded">
                          <div className="text-gray-600">25th</div>
                          <div className="font-bold">{result.return_percentiles['25th']}%</div>
                        </div>
                        <div className="p-2 bg-blue-50 rounded">
                          <div className="text-gray-600">50th</div>
                          <div className="font-bold text-blue-600">{result.return_percentiles['50th']}%</div>
                        </div>
                        <div className="p-2 bg-gray-100 rounded">
                          <div className="text-gray-600">75th</div>
                          <div className="font-bold">{result.return_percentiles['75th']}%</div>
                        </div>
                        <div className="p-2 bg-gray-50 rounded">
                          <div className="text-gray-600">95th</div>
                          <div className="font-bold">{result.return_percentiles['95th']}%</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        90% of outcomes fall between {result.return_percentiles['5th']}% and {result.return_percentiles['95th']}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Strategy Assessment */}
              <Card className="border-2 border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="text-lg text-blue-900">Strategy Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      {result.avg_return > 5 ? (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      ) : result.avg_return > 0 ? (
                        <Activity className="w-4 h-4 text-blue-600" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                      <span className="font-medium">
                        {result.avg_return > 10
                          ? '🎯 Excellent Strategy - High average returns across simulations'
                          : result.avg_return > 5
                          ? '✅ Good Strategy - Consistent positive returns'
                          : result.avg_return > 0
                          ? '⚠️ Moderate Strategy - Slightly positive returns'
                          : '❌ Risky Strategy - Average returns negative'}
                      </span>
                    </div>
                    <div className="text-gray-700">
                      • Positive Return Probability: <strong>{result.prob_positive_return}%</strong> (higher is better)
                    </div>
                    <div className="text-gray-700">
                      • Win Rate Stability: <strong>{result.avg_win_rate}%</strong> average across all scenarios
                    </div>
                    <div className="text-gray-700">
                      • Risk (Max Drawdown): Average <strong>-{result.avg_max_drawdown}%</strong>, Worst <strong>-{result.worst_drawdown}%</strong>
                    </div>
                    <div className="text-gray-700">
                      • Risk-Adjusted Return (Sharpe): <strong>{result.avg_sharpe}</strong> {result.avg_sharpe > 1 ? '(Good)' : result.avg_sharpe > 0 ? '(Acceptable)' : '(Poor)'}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MonteCarloSimulation;
