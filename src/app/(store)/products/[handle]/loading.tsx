// Mirrors the product-detail layout so the page doesn't jump when data arrives.
export default function Loading() {
  return (
    <div className="container">
      <div className="mm-skel mm-skel-line mb-3" style={{ width: 240 }} />
      <div className="card card-solid">
        <div className="card-body">
          <div className="row">
            <div className="col-12 col-sm-6">
              <div className="mm-skel" style={{ aspectRatio: "1", borderRadius: 12 }} />
            </div>
            <div className="col-12 col-sm-6">
              <div className="mm-skel mm-skel-line my-3" style={{ height: 28 }} />
              <div className="mm-skel mm-skel-line w-50" />
              <div className="mm-skel mm-skel-line w-75 mt-4" style={{ height: 38 }} />
              <div className="mm-skel mt-4" style={{ height: 80 }} />
              <div className="mm-skel mm-skel-line w-50 mt-4" style={{ height: 46 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
