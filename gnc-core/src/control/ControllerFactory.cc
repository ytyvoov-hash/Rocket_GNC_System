#include "gnc-core/control/ControllerFactory.h"
#include "gnc-core/control/PIDController.h"
#include "gnc-core/control/LQRController.h"
#include "gnc-core/control/SDREController.h"
#include "gnc-core/control/FallbackController.h"
#include "gnc-core/control/ControlAllocator.h"
#include "gnc-core/control/PID_GSController.h"
#include "gnc-core/control/LQGController.h"
#include "gnc-core/control/HInfinityController.h"
#include "gnc-core/control/SlidingModeController.h"
#include "gnc-core/control/BacksteppingController.h"
#include "gnc-core/control/MPCLinearController.h"
#include "gnc-core/control/MPCNonlinearController.h"
#include "gnc-core/control/MRACController.h"
#include "gnc-core/control/L1AdaptiveController.h"

namespace gnc::control {

std::tuple<std::shared_ptr<IController>, std::shared_ptr<IControlAllocator>> 
ControllerFactory::create(const TuningParams& params) {
    
    std::shared_ptr<IController> controller;
    if (params.algorithm == "PID") {
        controller = std::make_shared<PIDController>(params);
    } else if (params.algorithm == "PID_GS") {
        controller = std::make_shared<PID_GSController>(params);
    } else if (params.algorithm == "LQR") {
        LQRGains gains;
        gains.Q = params.Q;
        gains.R = params.R;
        gains.K = params.K;
        controller = std::make_shared<LQRController>(gains);
    } else if (params.algorithm == "LQG") {
        controller = std::make_shared<LQGController>(params);
    } else if (params.algorithm == "H_infinity") {
        controller = std::make_shared<HInfinityController>(params);
    } else if (params.algorithm == "SDRE") {
        SDREGains gains;
        gains.Q = params.Q;
        gains.R = params.R;
        controller = std::make_shared<SDREController>(gains);
    } else if (params.algorithm == "SlidingMode") {
        controller = std::make_shared<SlidingModeController>(params);
    } else if (params.algorithm == "Backstepping") {
        controller = std::make_shared<BacksteppingController>(params);
    } else if (params.algorithm == "MPC_linear") {
        controller = std::make_shared<MPCLinearController>(params);
    } else if (params.algorithm == "MPC_nonlinear") {
        controller = std::make_shared<MPCNonlinearController>(params);
    } else if (params.algorithm == "MRAC") {
        controller = std::make_shared<MRACController>(params);
    } else if (params.algorithm == "L1_adaptive") {
        controller = std::make_shared<L1AdaptiveController>(params);
    } else {
        controller = std::make_shared<FallbackController>(params.algorithm);
    }

    std::shared_ptr<IControlAllocator> allocator;
    if (params.controller_type == "tvc") {
        allocator = std::make_shared<TVCAllocator>();
    } else {
        // Build the fin geometry from the (template-supplied) layout. Defaults
        // preserve the canonical 4-fin "+" when a template omits these.
        FinGeometry geom;
        if (params.fin_layout == "ring") {
            geom = FinGeometry::ring(params.n_fins, params.Cl_delta, params.Cm_delta,
                                     params.fin_delta_max_rad);
        } else if (params.fin_layout == "canard") {
            geom = FinGeometry::canard4(params.Cl_delta, params.Cm_delta, params.Cn_delta,
                                        params.fin_delta_max_rad);
        } else {
            geom = FinGeometry::cruciform4(params.Cl_delta, params.Cm_delta, params.Cn_delta,
                                           params.fin_delta_max_rad);
        }
        allocator = std::make_shared<FinAllocator>(geom);
    }

    return {controller, allocator};
}

}
